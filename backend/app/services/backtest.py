"""Simulated day-by-day backtest over a profile's recent weather history.

The route stays thin; this module loads observed weather, rebuilds the
same ``EngineConfig`` the live recommendation uses, replays it with the
pure backtest engine, and returns the numbers with their assumptions.
Nothing here is a confirmed user action.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime

from app.db.models import Profile
from app.engine.backtest import (
    BacktestStep,
    BacktestSummary,
    HistoryDay,
    baseline_schedule_dates,
    simulate_backtest,
)
from app.engine.models import EngineConfig, IrrigationConstants, SourceRef
from app.engine.water_balance import compute_raw, compute_taw
from app.services.open_meteo import WeatherDay, WeatherUnavailableError

HistoryClient = Callable[[float, float], list[WeatherDay]]

SIMULATION_TAG = "Simulated, not your confirmed actions"

MIN_HISTORY_DAYS = 7

BACKTEST_SOURCE = SourceRef(
    id="open-meteo-history",
    label="Weather history used",
    citation=(
        "Open-Meteo forecast API, daily past_days: observed precipitation_sum and "
        "et0_fao_evapotranspiration (FAO-56 reference evapotranspiration)."
    ),
    url="https://open-meteo.com/",
)

BACKTEST_ASSUMPTIONS: tuple[str, ...] = (
    "Simulated, not your confirmed actions: every day in the window is replayed by the "
    "engine, not recorded from anything you did.",
    "The baseline is your saved schedule applied in full on every scheduled day; "
    "schedule days are spread evenly from your last watering date.",
    "The replay uses the same engine, cited constants, skip threshold, efficiency and "
    "application cap as a live recommendation.",
    "A backtest has no historical forecast, so each scheduled day is decided from the "
    "depletion at the start of that day instead of a projected horizon.",
    "The window starts at the refill point, the same convention the live recommendation "
    "uses before a recorded watering.",
    "Rain and ET₀ are observed gridded Open-Meteo values for your coordinates, not "
    "measurements in your yard.",
    "Estimated water avoided = baseline volume − simulated recommended volume. It is an "
    "estimate, not a metered saving.",
    "GreenFlow provides irrigation advice. It does not control or modify your irrigation timer.",
)

BACKTEST_LIMITATIONS: tuple[str, ...] = (
    "Observed weather only removes water the engine would have skipped; it cannot "
    "replay a forecast the way the live page does.",
    "The schedule is your reported frequency, not a log of when the sprinkler ran.",
    "No flow meter, water bill, or soil-moisture sensor is used.",
    "Every scheduled day is decided from the water already short at the start of that "
    "day, so the simulated run never applies water in advance. A live recommendation "
    "projects a horizon instead and would apply more, which makes this avoided volume "
    "an upper bound rather than a typical week.",
)


@dataclass(frozen=True, slots=True)
class SimulatedBacktest:
    profile_id: str
    generated_at: datetime
    tag: str
    window_days: int
    start_date: date
    end_date: date
    scheduled_events: int
    skip_events: int
    reduce_events: int
    water_events: int
    baseline_volume_l: float
    recommended_volume_l: float
    avoided_volume_l: float
    avoided_percent: float
    lawn_area_m2: float
    precipitation_rate_mm_per_hour: float
    baseline_minutes_per_event: int
    baseline_event_mm: float
    events_per_week: int
    irrigation_efficiency: float
    taw_mm: float
    raw_mm: float
    skip_threshold_mm: float
    total_et0_mm: float
    total_rainfall_mm: float
    steps: tuple[BacktestStep, ...]
    history: tuple[HistoryDay, ...]
    assumptions: tuple[str, ...]
    limitations: tuple[str, ...]
    sources: tuple[SourceRef, ...]


@dataclass(frozen=True, slots=True)
class CannotBacktest:
    code: str
    reason: str


BacktestOutcome = SimulatedBacktest | CannotBacktest


def _history_days(weather_days: list[WeatherDay]) -> list[HistoryDay]:
    return [
        HistoryDay(
            date=day.date,
            et0_mm=day.et0_mm,
            precipitation_mm=day.precipitation_mm,
        )
        for day in weather_days
        if not day.is_forecast
    ]


def backtest_for_profile(
    *,
    profile: Profile,
    history_client: HistoryClient,
    constants: IrrigationConstants | None,
    generated_at: datetime | None = None,
) -> BacktestOutcome:
    if constants is None:
        return CannotBacktest(
            code="constants_unavailable",
            reason=(
                "Irrigation constants are not configured, so a backtest cannot be calculated."
            ),
        )

    try:
        weather_days = history_client(profile.latitude, profile.longitude)
    except WeatherUnavailableError as exc:
        return CannotBacktest(code="weather_unavailable", reason=str(exc))

    history = _history_days(weather_days)
    if len(history) < MIN_HISTORY_DAYS:
        return CannotBacktest(
            code="insufficient_history",
            reason=(
                f"Open-Meteo returned {len(history)} observed days; "
                f"a backtest needs at least {MIN_HISTORY_DAYS}."
            ),
        )

    ordered = sorted(history, key=lambda day: day.date)
    window_start = ordered[0].date
    window_end = ordered[-1].date

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
    refill_point_mm = compute_raw(base_config)
    config = replace(base_config, initial_depletion_mm=refill_point_mm)

    schedule_dates = baseline_schedule_dates(
        anchor=profile.last_watered_date,
        events_per_week=profile.events_per_week,
        window_start=window_start,
        window_end=window_end,
    )

    summary: BacktestSummary = simulate_backtest(
        config=config,
        history=ordered,
        schedule_dates=schedule_dates,
        lawn_area_m2=profile.lawn_area_m2,
    )

    return SimulatedBacktest(
        profile_id=profile.id,
        generated_at=generated_at or datetime.now(UTC),
        tag=SIMULATION_TAG,
        window_days=summary.window_days,
        start_date=summary.start_date,
        end_date=summary.end_date,
        scheduled_events=summary.scheduled_events,
        skip_events=summary.skip_events,
        reduce_events=summary.reduce_events,
        water_events=summary.water_events,
        baseline_volume_l=summary.baseline_volume_l,
        recommended_volume_l=summary.recommended_volume_l,
        avoided_volume_l=summary.avoided_volume_l,
        avoided_percent=summary.avoided_percent,
        lawn_area_m2=profile.lawn_area_m2,
        precipitation_rate_mm_per_hour=profile.precipitation_rate_mm_per_hour,
        baseline_minutes_per_event=profile.baseline_minutes_per_event,
        baseline_event_mm=baseline_event_mm,
        events_per_week=profile.events_per_week,
        irrigation_efficiency=constants.irrigation_efficiency,
        taw_mm=compute_taw(config),
        raw_mm=refill_point_mm,
        skip_threshold_mm=constants.skip_fraction * refill_point_mm,
        total_et0_mm=sum(day.et0_mm for day in ordered),
        total_rainfall_mm=sum(day.precipitation_mm for day in ordered),
        steps=summary.steps,
        history=tuple(ordered),
        assumptions=BACKTEST_ASSUMPTIONS,
        limitations=BACKTEST_LIMITATIONS,
        sources=(BACKTEST_SOURCE, *constants.sources),
    )
