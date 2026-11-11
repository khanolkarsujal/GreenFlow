"""Pure daily water-balance and recommendation calculations.

See context/calculation-spec.md. This module performs no
network, database, or framework work.
"""

from __future__ import annotations

from collections.abc import Sequence
from math import ceil, isfinite

from .models import (
    DAYS_PER_WEEK,
    MILLIMETRES_PER_METRE,
    EngineConfig,
    EngineDay,
    EngineInputError,
    RecommendationResult,
    RecommendationState,
)


def compute_taw(config: EngineConfig) -> float:
    """Total available water in the root zone, in millimetres."""
    return (
        (config.field_capacity - config.wilting_point) * config.root_depth_m * MILLIMETRES_PER_METRE
    )


def compute_raw(config: EngineConfig) -> float:
    """Readily available water: the depletion at which stress begins."""
    return config.depletion_fraction * compute_taw(config)


def depletion_after_watering(
    *,
    taw_mm: float,
    raw_mm: float,
    applied_mm: float,
) -> float:
    """Depletion at the start of the last watering day.

    Assumes the root zone was at the refill point before that
    watering (calculation-spec.md Section 2.3).
    """
    if not isfinite(taw_mm) or taw_mm <= 0:
        raise EngineInputError(f"taw_mm must be finite and greater than zero; got {taw_mm!r}")
    _require_valid_depletion("raw_mm", raw_mm)
    _require_valid_depletion("applied_mm", applied_mm)
    return min(max(raw_mm - applied_mm, 0.0), taw_mm)


def compute_horizon(config: EngineConfig) -> int:
    """Days until the next baseline watering, capped and floored."""
    days_until_next_event = ceil(DAYS_PER_WEEK / config.baseline_events_per_week)
    return min(config.horizon_cap_days, max(1, days_until_next_event))


def _require_valid_depletion(name: str, value: float) -> None:
    if not isfinite(value) or value < 0:
        raise EngineInputError(f"{name} must be finite and non-negative; got {value!r}")


def effective_rainfall(precipitation_mm: float, previous_depletion_mm: float) -> float:
    """Rain that can refill the root zone; excess is assumed to drain."""
    _require_valid_depletion("precipitation_mm", precipitation_mm)
    _require_valid_depletion("previous_depletion_mm", previous_depletion_mm)
    return min(precipitation_mm, max(0.0, previous_depletion_mm))


def update_depletion(
    previous_depletion_mm: float,
    day: EngineDay,
    *,
    crop_coefficient: float,
    taw_mm: float,
) -> float:
    """Apply one day of demand, rain, and irrigation, then clamp."""
    _require_valid_depletion("previous_depletion_mm", previous_depletion_mm)
    if not isfinite(taw_mm) or taw_mm <= 0:
        raise EngineInputError(f"taw_mm must be finite and greater than zero; got {taw_mm!r}")
    if not isfinite(crop_coefficient) or crop_coefficient < 0:
        raise EngineInputError(
            f"crop_coefficient must be finite and non-negative; got {crop_coefficient!r}"
        )

    crop_demand_mm = crop_coefficient * day.et0_mm
    rain_refill_mm = effective_rainfall(day.precipitation_mm, previous_depletion_mm)
    depletion_mm = previous_depletion_mm + crop_demand_mm - rain_refill_mm - day.irrigation_mm
    return min(max(depletion_mm, 0.0), taw_mm)


def project_forecast(
    config: EngineConfig,
    forecast_days: Sequence[EngineDay],
) -> tuple[int, tuple[float, ...]]:
    """Project depletion over forecast days 1..H, excluding today."""
    horizon_days = compute_horizon(config)
    if len(forecast_days) < horizon_days:
        raise EngineInputError(
            f"need at least {horizon_days} forecast days, got {len(forecast_days)}"
        )

    taw_mm = compute_taw(config)
    depletion_mm = config.initial_depletion_mm
    projected: list[float] = []
    for day in forecast_days[:horizon_days]:
        if not day.is_forecast:
            raise EngineInputError(f"forecast day {day.date} is not marked as a forecast")
        depletion_mm = update_depletion(
            depletion_mm,
            day,
            crop_coefficient=config.crop_coefficient,
            taw_mm=taw_mm,
        )
        projected.append(depletion_mm)
    return horizon_days, tuple(projected)


def recommend(
    config: EngineConfig,
    forecast_days: Sequence[EngineDay],
) -> RecommendationResult:
    """Return SKIP, REDUCE, or WATER with the supporting numbers."""
    taw_mm = compute_taw(config)
    raw_mm = compute_raw(config)
    horizon_days, projected = project_forecast(config, forecast_days)
    projected_max_mm = max(projected)
    skip_threshold_mm = config.skip_fraction * raw_mm

    if projected_max_mm <= skip_threshold_mm:
        state = RecommendationState.SKIP
        recommended_depth_mm = 0.0
    else:
        recommended_depth_mm = min(
            projected_max_mm / config.irrigation_efficiency,
            config.max_application_mm,
        )
        if recommended_depth_mm >= config.baseline_event_mm:
            state = RecommendationState.WATER
        else:
            state = RecommendationState.REDUCE

    return RecommendationResult(
        state=state,
        recommended_depth_mm=recommended_depth_mm,
        taw_mm=taw_mm,
        raw_mm=raw_mm,
        skip_threshold_mm=skip_threshold_mm,
        horizon_days=horizon_days,
        projected_depletions_mm=projected,
        projected_max_depletion_mm=projected_max_mm,
    )
