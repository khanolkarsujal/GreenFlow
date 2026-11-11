"""Estimated water avoided, relative to a stated baseline schedule.

See context/calculation-spec.md Section 6. This module performs
no network, database, or framework work.
"""

from __future__ import annotations

from collections.abc import Sequence
from math import isfinite

from .models import DAYS_PER_WEEK, EngineInputError, SavingsBaseline, SavingsEstimate

# Structural conversion: 1 mm over 1 m² is 1 L.
LITRES_PER_MM_OVER_M2 = 1.0

SAVINGS_ASSUMPTIONS: tuple[str, ...] = (
    "Estimated from the baseline schedule entered, not from actual water use.",
    "Uses forecast weather data; real conditions may differ.",
    "Recommended depths are applied depths, so irrigation efficiency is already included.",
    "Volumes assume 1 mm over 1 m² equals 1 L.",
)


def _require_finite_non_negative(name: str, value: float) -> None:
    if not isfinite(value) or value < 0:
        raise EngineInputError(f"{name} must be finite and non-negative; got {value!r}")


def estimate_savings(
    *,
    baseline_event_depth_mm: float,
    baseline_events_per_week: float,
    window_days: int,
    lawn_area_m2: float,
    recommended_depths_mm: Sequence[float],
    irrigation_efficiency: float,
) -> SavingsEstimate:
    """Estimate water avoided against the baseline schedule.

    ``recommended_depths_mm`` holds one applied depth per day in
    the window, with 0 for a day without watering. Irrigation
    efficiency is reported with the result because it is already
    reflected in those depths; it is not applied again.
    """
    _require_finite_non_negative("baseline_event_depth_mm", baseline_event_depth_mm)
    _require_finite_non_negative("baseline_events_per_week", baseline_events_per_week)
    if not isinstance(window_days, int) or window_days <= 0:
        raise EngineInputError(f"window_days must be a positive integer; got {window_days!r}")
    if not isfinite(lawn_area_m2) or lawn_area_m2 <= 0:
        raise EngineInputError(
            f"lawn_area_m2 must be finite and greater than zero; got {lawn_area_m2!r}"
        )
    if not isfinite(irrigation_efficiency) or not 0 < irrigation_efficiency <= 1:
        raise EngineInputError(
            f"irrigation_efficiency must be in (0, 1]; got {irrigation_efficiency!r}"
        )
    if len(recommended_depths_mm) != window_days:
        raise EngineInputError(
            f"recommended_depths_mm must have {window_days} entries; "
            f"got {len(recommended_depths_mm)}"
        )
    for index, depth_mm in enumerate(recommended_depths_mm):
        _require_finite_non_negative(f"recommended_depths_mm[{index}]", depth_mm)

    events_in_window = baseline_events_per_week * window_days / DAYS_PER_WEEK
    baseline_volume_l = (
        baseline_event_depth_mm * events_in_window * lawn_area_m2 * LITRES_PER_MM_OVER_M2
    )
    recommended_volume_l = sum(recommended_depths_mm) * lawn_area_m2 * LITRES_PER_MM_OVER_M2
    estimated_water_avoided_l = max(0.0, baseline_volume_l - recommended_volume_l)

    return SavingsEstimate(
        baseline=SavingsBaseline(
            event_depth_mm=baseline_event_depth_mm,
            events_per_week=baseline_events_per_week,
            events_in_window=events_in_window,
        ),
        window_days=window_days,
        lawn_area_m2=lawn_area_m2,
        irrigation_efficiency=irrigation_efficiency,
        baseline_volume_l=baseline_volume_l,
        recommended_volume_l=recommended_volume_l,
        estimated_water_avoided_l=estimated_water_avoided_l,
        assumptions=SAVINGS_ASSUMPTIONS,
    )
