"""Day-by-day replay of the water balance over observed weather history.

The live recommendation projects forward with a forecast. A backtest
has no historical forecast archive, so each scheduled day is decided
from the depletion at the start of that day using the same constants,
the same water-balance update, and the same skip threshold as the live
engine. Nothing here performs network, database, or framework work.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from math import isfinite

from .models import EngineConfig, EngineDay, EngineInputError
from .water_balance import compute_raw, compute_taw, update_depletion

LITRES_PER_MM_OVER_M2 = 1.0


@dataclass(frozen=True, slots=True)
class HistoryDay:
    """One observed day used by the backtest."""

    date: date
    et0_mm: float
    precipitation_mm: float

    def __post_init__(self) -> None:
        for name, value in (("et0_mm", self.et0_mm), ("precipitation_mm", self.precipitation_mm)):
            if not isfinite(value) or value < 0:
                raise EngineInputError(f"{name} must be finite and non-negative; got {value!r}")


@dataclass(frozen=True, slots=True)
class BacktestStep:
    date: date
    scheduled: bool
    state: str | None
    depletion_start_mm: float
    baseline_applied_mm: float
    recommended_applied_mm: float
    depletion_end_mm: float


@dataclass(frozen=True, slots=True)
class BacktestSummary:
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
    steps: tuple[BacktestStep, ...]


def baseline_schedule_dates(
    *,
    anchor: date,
    events_per_week: int,
    window_start: date,
    window_end: date,
) -> set[date]:
    """Evenly spaced baseline days anchored on a real watering date.

    ``events_per_week`` is the reported schedule; dates are spread with
    rounding so a 3-per-week schedule alternates 2 and 3 day gaps
    instead of drifting.
    """
    if events_per_week < 1 or events_per_week > 7:
        raise EngineInputError(f"events_per_week must be 1..7; got {events_per_week!r}")
    if window_start > window_end:
        raise EngineInputError("window_start must not be after window_end")

    interval_days = 7.0 / events_per_week
    span = (window_end - window_start).days + events_per_week + 2
    dates: set[date] = set()

    for offset in range(-span, span + 1):
        candidate = anchor + timedelta(days=round(offset * interval_days))
        if window_start <= candidate <= window_end:
            dates.add(candidate)

    return dates


def simulate_backtest(
    *,
    config: EngineConfig,
    history: Sequence[HistoryDay],
    schedule_dates: set[date],
    lawn_area_m2: float,
) -> BacktestSummary:
    """Replay observed history and compare it with the baseline schedule."""
    if not history:
        raise EngineInputError("history must contain at least one day")
    if not isfinite(lawn_area_m2) or lawn_area_m2 <= 0:
        raise EngineInputError(f"lawn_area_m2 must be finite and greater than zero; got {lawn_area_m2!r}")

    ordered = sorted(history, key=lambda day: day.date)
    if len({day.date for day in ordered}) != len(ordered):
        raise EngineInputError("history contains duplicate dates")

    taw_mm = compute_taw(config)
    raw_mm = compute_raw(config)
    skip_threshold_mm = config.skip_fraction * raw_mm

    depletion_mm = config.initial_depletion_mm
    baseline_volume_l = 0.0
    recommended_volume_l = 0.0
    steps: list[BacktestStep] = []
    skip_events = reduce_events = water_events = 0

    for day in ordered:
        scheduled = day.date in schedule_dates
        state: str | None = None
        recommended_applied_mm = 0.0
        baseline_applied_mm = 0.0
        depletion_start_mm = depletion_mm

        if scheduled:
            baseline_applied_mm = config.baseline_event_mm
            if depletion_mm <= skip_threshold_mm:
                state = "SKIP"
                skip_events += 1
            else:
                required_mm = min(
                    depletion_mm / config.irrigation_efficiency,
                    config.max_application_mm,
                )
                if required_mm >= config.baseline_event_mm:
                    state = "WATER"
                    recommended_applied_mm = config.baseline_event_mm
                    water_events += 1
                else:
                    state = "REDUCE"
                    recommended_applied_mm = required_mm
                    reduce_events += 1

            baseline_volume_l += baseline_applied_mm * lawn_area_m2 * LITRES_PER_MM_OVER_M2
            recommended_volume_l += recommended_applied_mm * lawn_area_m2 * LITRES_PER_MM_OVER_M2

        depletion_mm = update_depletion(
            depletion_mm,
            EngineDay(
                date=day.date,
                et0_mm=day.et0_mm,
                precipitation_mm=day.precipitation_mm,
                irrigation_mm=recommended_applied_mm,
            ),
            crop_coefficient=config.crop_coefficient,
            taw_mm=taw_mm,
        )

        steps.append(
            BacktestStep(
                date=day.date,
                scheduled=scheduled,
                state=state,
                depletion_start_mm=depletion_start_mm,
                baseline_applied_mm=baseline_applied_mm,
                recommended_applied_mm=recommended_applied_mm,
                depletion_end_mm=depletion_mm,
            )
        )

    avoided_volume_l = max(0.0, baseline_volume_l - recommended_volume_l)
    avoided_percent = avoided_volume_l / baseline_volume_l * 100.0 if baseline_volume_l > 0 else 0.0

    return BacktestSummary(
        window_days=len(ordered),
        start_date=ordered[0].date,
        end_date=ordered[-1].date,
        scheduled_events=skip_events + reduce_events + water_events,
        skip_events=skip_events,
        reduce_events=reduce_events,
        water_events=water_events,
        baseline_volume_l=baseline_volume_l,
        recommended_volume_l=recommended_volume_l,
        avoided_volume_l=avoided_volume_l,
        avoided_percent=avoided_percent,
        steps=tuple(steps),
    )
