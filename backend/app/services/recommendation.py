"""Orchestration for stored recommendations.

The route stays thin; this module loads weather, maps it to
engine inputs, calls the pure engine, and stores the result
with its inputs, constants, and assumptions.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, replace
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.db import recommendations as recommendation_store
from app.db.models import Profile
from app.engine.constants import resolve_constants
from app.engine.models import (
    EngineConfig,
    EngineDay,
    IrrigationConstants,
    RecommendationResult,
    RecommendationState,
    SourceRef,
)
from app.engine.water_balance import (
    compute_horizon,
    compute_raw,
    compute_taw,
    depletion_after_watering,
    recommend,
    update_depletion,
)
from app.services.open_meteo import WeatherDay, WeatherUnavailableError

WeatherClient = Callable[[float, float], list[WeatherDay]]
ConstantsResolver = Callable[[Profile], IrrigationConstants | None]

OPEN_METEO_SOURCE = SourceRef(
    id="open-meteo",
    label="Weather and ET₀",
    citation=(
        "Open-Meteo forecast API: precipitation_sum and "
        "et0_fao_evapotranspiration (FAO-56 reference evapotranspiration)."
    ),
    url="https://open-meteo.com/",
)

DURATION_FORMULA = "minutes = depth_mm ÷ precipitation_rate_mm_per_hour × 60"

EFFICIENCY_NOTE = (
    "Recommended depth is a gross application: the crop demand is divided by "
    "the irrigation efficiency before the run time is calculated."
)

LIMITATIONS: tuple[str, ...] = (
    "ET₀ is Open-Meteo's FAO-56 reference evapotranspiration, not a reading "
    "from a weather station in your yard.",
    "The water balance assumes the root zone was at the refill point before "
    "the last watering you recorded.",
    "Rainfall is a gridded weather value and may differ from the rain that reached your lawn.",
    "Irrigation efficiency is a cited 60% default; it is not a catch-cup "
    "measurement of your sprinkler system.",
    "Weather forecasts can change after this recommendation is created.",
    "GreenFlow does not measure soil moisture, water flow, or actual water use.",
    "GreenFlow provides advice only; it does not control or modify your irrigation timer.",
)


@dataclass(frozen=True, slots=True)
class ExplanationFactor:
    id: str
    label: str
    value: str
    role: str
    detail: str
    source_id: str | None = None


@dataclass(frozen=True, slots=True)
class WeatherFreshness:
    mode: str
    provider: str
    retrieved_at: datetime
    observed_start: date
    observed_end: date
    forecast_start: date
    forecast_end: date
    forecast_days_available: int
    horizon_days: int
    note: str


@dataclass(frozen=True, slots=True)
class DurationAdvice:
    recommended_minutes: int
    baseline_minutes: int
    suggested_change_minutes: int
    depth_mm: float
    precipitation_rate_mm_per_hour: float
    irrigation_efficiency: float
    formula: str
    efficiency_note: str


@dataclass(frozen=True, slots=True)
class StoredRecommendation:
    id: str
    profile_id: str
    created_at: datetime
    state: RecommendationState
    recommended_depth_mm: float
    recommended_minutes: int
    baseline_minutes: int
    suggested_change_minutes: int
    reason: str
    uncertainty: str
    initial_depletion_mm: float
    observed_rainfall_mm: float
    forecast_rainfall_mm: float
    forecast_et0_mm: float
    estimated_crop_demand_mm: float
    taw_mm: float
    raw_mm: float
    skip_threshold_mm: float
    horizon_days: int
    projected_depletions_mm: tuple[float, ...]
    projected_max_depletion_mm: float
    baseline_event_mm: float
    irrigation_efficiency: float
    precipitation_rate_mm_per_hour: float
    lawn_area_m2: float
    assumptions: tuple[str, ...]
    limitations: tuple[str, ...]
    sources: tuple[SourceRef, ...]
    factors: tuple[ExplanationFactor, ...]
    observed_inputs: tuple[dict[str, object], ...]
    forecast_inputs: tuple[dict[str, object], ...]
    freshness: WeatherFreshness


@dataclass(frozen=True, slots=True)
class CannotRecommend:
    code: str
    reason: str


RecommendationOutcome = StoredRecommendation | CannotRecommend


def resolve_irrigation_constants(profile: Profile) -> IrrigationConstants:
    """Return cited constants for this profile or raise ConstantsUnavailable."""
    return resolve_constants(profile)


def recommend_for_profile(
    session: Session,
    *,
    profile: Profile,
    weather_client: WeatherClient,
    constants: IrrigationConstants | None,
    created_at: datetime | None = None,
) -> RecommendationOutcome:
    if constants is None:
        return CannotRecommend(
            code="constants_unavailable",
            reason=(
                "Irrigation constants are not configured, so a recommendation cannot be calculated."
            ),
        )

    try:
        weather_days = weather_client(profile.latitude, profile.longitude)
    except WeatherUnavailableError as exc:
        return CannotRecommend(code="weather_unavailable", reason=str(exc))

    retrieved_at = created_at or datetime.now(UTC)
    observed_days = [day for day in weather_days if not day.is_forecast]
    all_forecast_days = [day for day in weather_days if day.is_forecast]
    forecast_days = list(all_forecast_days)
    if not observed_days or not forecast_days:
        return CannotRecommend(
            code="weather_unavailable",
            reason="Open-Meteo did not return both weather history and a forecast.",
        )

    forecast_start = forecast_days[0].date
    if abs((forecast_start - retrieved_at.date()).days) > 1:
        return CannotRecommend(
            code="stale_weather_data",
            reason=(
                f"The newest weather data starts on {forecast_start.isoformat()}, "
                "which is not current. Retry when Open-Meteo returns current data."
            ),
        )

    baseline_event_mm = (
        profile.precipitation_rate_mm_per_hour * profile.baseline_minutes_per_event / 60.0
    )
    base_config = EngineConfig(
        crop_coefficient=constants.crop_coefficient,
        field_capacity=constants.field_capacity,
        wilting_point=constants.wilting_point,
        root_depth_m=constants.root_depth_m,
        depletion_fraction=constants.depletion_fraction,
        skip_fraction=constants.skip_fraction,
        baseline_events_per_week=float(profile.events_per_week),
        horizon_cap_days=constants.horizon_cap_days,
        irrigation_efficiency=constants.irrigation_efficiency,
        max_application_mm=constants.max_application_mm,
        baseline_event_mm=baseline_event_mm,
        initial_depletion_mm=0.0,
    )
    taw_mm = compute_taw(base_config)
    raw_mm = compute_raw(base_config)

    last_watered_index = _find_day_index(observed_days, profile.last_watered_date)
    water_today = (
        last_watered_index is None
        and bool(forecast_days)
        and forecast_days[0].date == profile.last_watered_date
    )
    if last_watered_index is None and not water_today:
        return CannotRecommend(
            code="last_watering_out_of_range",
            reason=(
                "The last watering date is not in the available weather history. "
                "Update the profile with a recent watering date."
            ),
        )

    last_irrigation_mm = (
        profile.precipitation_rate_mm_per_hour * profile.last_watered_minutes / 60.0
    )
    depletion_mm = depletion_after_watering(
        taw_mm=taw_mm,
        raw_mm=raw_mm,
        applied_mm=last_irrigation_mm,
    )
    observed_inputs: list[dict[str, object]] = []
    if water_today:
        today = forecast_days[0]
        depletion_mm = update_depletion(
            depletion_mm,
            _to_engine_day(today),
            crop_coefficient=constants.crop_coefficient,
            taw_mm=taw_mm,
        )
        observed_inputs.append(_weather_input(today, basis="today_forecast"))
        observed_rainfall_mm = today.precipitation_mm
        forecast_days = forecast_days[1:]
    else:
        observed_used = observed_days[last_watered_index:]
        for weather_day in observed_used:
            depletion_mm = update_depletion(
                depletion_mm,
                _to_engine_day(weather_day),
                crop_coefficient=constants.crop_coefficient,
                taw_mm=taw_mm,
            )
            observed_inputs.append(_weather_input(weather_day, basis="observed"))
        observed_rainfall_mm = sum(day.precipitation_mm for day in observed_used)

    config = replace(base_config, initial_depletion_mm=depletion_mm)
    horizon_days = compute_horizon(config)
    if len(forecast_days) < horizon_days:
        return CannotRecommend(
            code="insufficient_forecast",
            reason=(
                f"Only {len(forecast_days)} forecast days are available; {horizon_days} are needed."
            ),
        )

    forecast_engine_days = [_to_engine_day(day) for day in forecast_days]
    result = recommend(config, forecast_engine_days)

    forecast_used = forecast_days[: result.horizon_days]
    forecast_rainfall_mm = sum(day.precipitation_mm for day in forecast_used)
    forecast_et0_mm = sum(day.et0_mm for day in forecast_used)
    estimated_crop_demand_mm = constants.crop_coefficient * forecast_et0_mm

    duration = _duration_for(result, profile, constants.irrigation_efficiency)
    reason = _reason_for(result, baseline_event_mm)
    uncertainty = (
        f"Based on a {result.horizon_days}-day weather forecast that can change. "
        "Check local conditions before watering."
    )
    assumptions = _assumptions_for(profile, constants, baseline_event_mm, result)
    freshness = _freshness_for(
        observed_days=observed_days,
        forecast_days=all_forecast_days,
        retrieved_at=retrieved_at,
        horizon_days=result.horizon_days,
    )
    sources = constants.sources + (OPEN_METEO_SOURCE,)
    factors = _factors_for(
        profile=profile,
        constants=constants,
        result=result,
        observed_rainfall_mm=observed_rainfall_mm,
        forecast_rainfall_mm=forecast_rainfall_mm,
        forecast_et0_mm=forecast_et0_mm,
        estimated_crop_demand_mm=estimated_crop_demand_mm,
        initial_depletion_mm=config.initial_depletion_mm,
    )

    stored = recommendation_store.create_recommendation(
        session,
        profile_id=profile.id,
        created_at=retrieved_at,
        state=result.state.value,
        recommended_depth_mm=result.recommended_depth_mm,
        recommended_minutes=duration.recommended_minutes,
        baseline_minutes=duration.baseline_minutes,
        retrieved_at=retrieved_at,
        weather_mode=freshness.mode,
        reason=reason,
        uncertainty=uncertainty,
        taw_mm=result.taw_mm,
        raw_mm=result.raw_mm,
        skip_threshold_mm=result.skip_threshold_mm,
        horizon_days=result.horizon_days,
        projected_depletions_mm=list(result.projected_depletions_mm),
        projected_max_depletion_mm=result.projected_max_depletion_mm,
        baseline_event_mm=baseline_event_mm,
        irrigation_efficiency=constants.irrigation_efficiency,
        config=asdict(config),
        forecast_inputs=[_weather_input(day, basis="forecast") for day in forecast_used],
        observed_inputs=observed_inputs,
        profile_inputs=_profile_inputs(profile),
        assumptions=list(assumptions),
        limitations=list(LIMITATIONS),
        sources=[asdict(source) for source in sources],
    )

    return StoredRecommendation(
        id=stored.id,
        profile_id=stored.profile_id,
        created_at=retrieved_at,
        state=result.state,
        recommended_depth_mm=result.recommended_depth_mm,
        recommended_minutes=duration.recommended_minutes,
        baseline_minutes=duration.baseline_minutes,
        suggested_change_minutes=duration.suggested_change_minutes,
        reason=reason,
        uncertainty=uncertainty,
        initial_depletion_mm=config.initial_depletion_mm,
        observed_rainfall_mm=observed_rainfall_mm,
        forecast_rainfall_mm=forecast_rainfall_mm,
        forecast_et0_mm=forecast_et0_mm,
        estimated_crop_demand_mm=estimated_crop_demand_mm,
        taw_mm=result.taw_mm,
        raw_mm=result.raw_mm,
        skip_threshold_mm=result.skip_threshold_mm,
        horizon_days=result.horizon_days,
        projected_depletions_mm=result.projected_depletions_mm,
        projected_max_depletion_mm=result.projected_max_depletion_mm,
        baseline_event_mm=baseline_event_mm,
        irrigation_efficiency=constants.irrigation_efficiency,
        precipitation_rate_mm_per_hour=profile.precipitation_rate_mm_per_hour,
        lawn_area_m2=profile.lawn_area_m2,
        assumptions=assumptions,
        limitations=LIMITATIONS,
        sources=sources,
        factors=factors,
        observed_inputs=tuple(observed_inputs),
        forecast_inputs=tuple(_weather_input(day, basis="forecast") for day in forecast_used),
        freshness=freshness,
    )


def _find_day_index(days: Sequence[WeatherDay], target: date) -> int | None:
    for index, day in enumerate(days):
        if day.date == target:
            return index
    return None


def _to_engine_day(weather_day: WeatherDay) -> EngineDay:
    return EngineDay(
        date=weather_day.date,
        et0_mm=weather_day.et0_mm,
        precipitation_mm=weather_day.precipitation_mm,
        irrigation_mm=0.0,
        is_forecast=weather_day.is_forecast,
    )


def _weather_input(weather_day: WeatherDay, *, basis: str) -> dict[str, object]:
    return {
        "date": weather_day.date.isoformat(),
        "et0_mm": weather_day.et0_mm,
        "precipitation_mm": weather_day.precipitation_mm,
        "basis": basis,
    }


def _profile_inputs(profile: Profile) -> dict[str, object]:
    return {
        "location_label": profile.location_label,
        "latitude": profile.latitude,
        "longitude": profile.longitude,
        "lawn_area_m2": profile.lawn_area_m2,
        "grass_type": profile.grass_type,
        "soil_type": profile.soil_type,
        "sprinkler_type": profile.sprinkler_type,
        "precipitation_rate_mm_per_hour": profile.precipitation_rate_mm_per_hour,
        "baseline_minutes_per_event": profile.baseline_minutes_per_event,
        "events_per_week": profile.events_per_week,
        "last_watered_date": profile.last_watered_date.isoformat(),
        "last_watered_minutes": profile.last_watered_minutes,
    }


def _duration_for(
    result: RecommendationResult,
    profile: Profile,
    irrigation_efficiency: float,
) -> DurationAdvice:
    exact_minutes = result.recommended_depth_mm / profile.precipitation_rate_mm_per_hour * 60.0
    recommended_minutes = 0 if result.recommended_depth_mm <= 0 else max(1, round(exact_minutes))

    return DurationAdvice(
        recommended_minutes=recommended_minutes,
        baseline_minutes=profile.baseline_minutes_per_event,
        suggested_change_minutes=recommended_minutes - profile.baseline_minutes_per_event,
        depth_mm=result.recommended_depth_mm,
        precipitation_rate_mm_per_hour=profile.precipitation_rate_mm_per_hour,
        irrigation_efficiency=irrigation_efficiency,
        formula=DURATION_FORMULA,
        efficiency_note=EFFICIENCY_NOTE,
    )


def _freshness_for(
    *,
    observed_days: Sequence[WeatherDay],
    forecast_days: Sequence[WeatherDay],
    retrieved_at: datetime,
    horizon_days: int,
) -> WeatherFreshness:
    return WeatherFreshness(
        mode="live",
        provider="Open-Meteo",
        retrieved_at=retrieved_at,
        observed_start=observed_days[0].date,
        observed_end=observed_days[-1].date,
        forecast_start=forecast_days[0].date,
        forecast_end=forecast_days[-1].date,
        forecast_days_available=len(forecast_days),
        horizon_days=horizon_days,
        note=(
            "Fetched from Open-Meteo for this request. GreenFlow does not cache "
            "weather results, so this recommendation uses live data."
        ),
    )


def _factors_for(
    *,
    profile: Profile,
    constants: IrrigationConstants,
    result: RecommendationResult,
    observed_rainfall_mm: float,
    forecast_rainfall_mm: float,
    forecast_et0_mm: float,
    estimated_crop_demand_mm: float,
    initial_depletion_mm: float,
) -> tuple[ExplanationFactor, ...]:
    return (
        ExplanationFactor(
            id="forecast-et0",
            label="Forecast reference ET₀",
            value=f"{forecast_et0_mm:.1f} mm",
            role="applied",
            detail=(
                f"Summed over the {result.horizon_days}-day decision horizon and "
                "converted to crop demand with the grass coefficient."
            ),
            source_id="open-meteo",
        ),
        ExplanationFactor(
            id="crop-demand",
            label="Estimated crop demand",
            value=f"{estimated_crop_demand_mm:.1f} mm",
            role="applied",
            detail=(
                f"Kc {constants.crop_coefficient:.2f} × forecast ET₀ {forecast_et0_mm:.1f} mm."
            ),
            source_id="fao56-table-12",
        ),
        ExplanationFactor(
            id="forecast-rain",
            label="Forecast rainfall",
            value=f"{forecast_rainfall_mm:.1f} mm",
            role="applied",
            detail="Rain in the decision horizon is credited against soil-water depletion.",
            source_id="open-meteo",
        ),
        ExplanationFactor(
            id="observed-rain",
            label="Rain since last watering",
            value=f"{observed_rainfall_mm:.1f} mm",
            role="applied",
            detail="Observed daily rainfall since the last watering date you recorded.",
            source_id="open-meteo",
        ),
        ExplanationFactor(
            id="initial-depletion",
            label="Depletion after last watering",
            value=f"{initial_depletion_mm:.1f} mm",
            role="applied",
            detail=(
                "clamp(RAW − applied depth, 0, TAW) with the assumption that the "
                "root zone was at the refill point before that watering."
            ),
            source_id="fao56-table-19",
        ),
        ExplanationFactor(
            id="soil-water",
            label="Soil water capacity",
            value=f"TAW {result.taw_mm:.1f} mm · RAW {result.raw_mm:.1f} mm",
            role="applied",
            detail=(
                f"{profile.soil_type} soil: field capacity "
                f"{constants.field_capacity:.2f} and wilting point "
                f"{constants.wilting_point:.2f} m³/m³ over a "
                f"{constants.root_depth_m:.2f} m root zone."
            ),
            source_id="fao56-table-19",
        ),
        ExplanationFactor(
            id="skip-threshold",
            label="Skip threshold",
            value=f"{result.skip_threshold_mm:.1f} mm",
            role="applied",
            detail=(
                "50% of RAW, a product policy. A projected depletion at or below "
                "this value produces a SKIP recommendation."
            ),
            source_id=None,
        ),
        ExplanationFactor(
            id="efficiency",
            label="Irrigation efficiency",
            value=f"{constants.irrigation_efficiency:.0%}",
            role="applied",
            detail=(
                "Cited default used to convert crop demand into a gross applied "
                "depth before run time is calculated."
            ),
            source_id="csu-efficiency",
        ),
        ExplanationFactor(
            id="grass",
            label="Grass type",
            value=profile.grass_type,
            role="applied",
            detail=(
                f"Crop coefficient {constants.crop_coefficient:.2f} and depletion "
                f"fraction {constants.depletion_fraction:.2f} selected for this grass."
            ),
            source_id="fao56-table-12",
        ),
        ExplanationFactor(
            id="delivery-rate",
            label="Sprinkler precipitation rate",
            value=f"{profile.precipitation_rate_mm_per_hour:.1f} mm/h",
            role="applied",
            detail="Used with the recommended depth to calculate run time in minutes.",
            source_id=None,
        ),
        ExplanationFactor(
            id="lawn-area",
            label="Lawn area",
            value=f"{profile.lawn_area_m2:.0f} m²",
            role="context",
            detail=(
                "Used for water-volume estimates on the savings screen, not for the depth decision."
            ),
            source_id=None,
        ),
        ExplanationFactor(
            id="location",
            label="Location",
            value=profile.location_label,
            role="context",
            detail="Weather is requested for the saved latitude and longitude.",
            source_id="open-meteo",
        ),
    )


def _reason_for(
    result: RecommendationResult,
    baseline_event_mm: float,
) -> str:
    if result.state is RecommendationState.SKIP:
        return f"The lawn is not projected to need water in the next {result.horizon_days} days."
    if result.state is RecommendationState.REDUCE:
        return (
            f"The lawn is projected to need {result.recommended_depth_mm:.1f} mm, "
            f"less than a normal {baseline_event_mm:.1f} mm watering."
        )
    return (
        f"The lawn is projected to need at least a normal "
        f"{baseline_event_mm:.1f} mm watering within the next "
        f"{result.horizon_days} days."
    )


def _assumptions_for(
    profile: Profile,
    constants: IrrigationConstants,
    baseline_event_mm: float,
    result: RecommendationResult,
) -> tuple[str, ...]:
    return (
        f"Baseline schedule: {profile.events_per_week} event(s) per week "
        f"at {baseline_event_mm:.1f} mm per event.",
        f"Decision horizon: {result.horizon_days} day(s) until the next scheduled watering.",
        "No irrigation is assumed on forecast days.",
        "The root zone was at the refill point before the last watering.",
        "Weather data is from Open-Meteo and may change.",
        *constants.source_notes,
    )
