"""Tests for the pure backtest replay.

The numeric values are test values chosen so the arithmetic is easy to
check by hand; they are not product constants.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.engine.backtest import (
    HistoryDay,
    baseline_schedule_dates,
    simulate_backtest,
)
from app.engine.models import EngineConfig, EngineInputError

WINDOW_START = date(2026, 1, 1)
ANCHOR = date(2026, 1, 1)
WINDOW_END = WINDOW_START + timedelta(days=29)


def _config(**overrides: object) -> EngineConfig:
    # TAW = (0.30 - 0.10) * 0.20 * 1000 = 40 mm; RAW = 0.5 * 40 = 20 mm;
    # skip threshold = 0.5 * 20 = 10 mm; baseline event = 15 mm.
    values: dict[str, object] = {
        "crop_coefficient": 1.0,
        "field_capacity": 0.30,
        "wilting_point": 0.10,
        "root_depth_m": 0.20,
        "depletion_fraction": 0.5,
        "skip_fraction": 0.5,
        "baseline_events_per_week": 3.0,
        "horizon_cap_days": 7,
        "irrigation_efficiency": 1.0,
        "max_application_mm": 40.0,
        "baseline_event_mm": 15.0,
        "initial_depletion_mm": 20.0,
    }
    values.update(overrides)
    return EngineConfig(**values)  # type: ignore[arg-type]


def _history(et0_mm: float, precipitation_mm: float = 0.0) -> list[HistoryDay]:
    return [
        HistoryDay(
            date=WINDOW_START + timedelta(days=offset),
            et0_mm=et0_mm,
            precipitation_mm=precipitation_mm,
        )
        for offset in range(30)
    ]


def test_three_per_week_schedule_alternates_two_and_three_day_gaps() -> None:
    dates = sorted(
        baseline_schedule_dates(
            anchor=ANCHOR,
            events_per_week=3,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
        )
    )

    # 7 / 3 = 2.333 day spacing, rounded from the anchor: day offsets
    # 0, 2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28.
    assert dates[0] == ANCHOR
    gaps = [(b - a).days for a, b in zip(dates, dates[1:], strict=False)]
    assert gaps == [2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2]
    assert len(dates) == 13


def test_schedule_rejects_an_impossible_frequency() -> None:
    with pytest.raises(EngineInputError, match="events_per_week"):
        baseline_schedule_dates(
            anchor=ANCHOR,
            events_per_week=0,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
        )


def test_replay_never_applies_more_than_the_baseline() -> None:
    # 20 mm of demand per day keeps depletion at or above the refill point,
    # so every scheduled day asks for at least the 15 mm baseline event.
    summary = simulate_backtest(
        config=_config(),
        history=_history(et0_mm=20.0),
        schedule_dates=baseline_schedule_dates(
            anchor=ANCHOR,
            events_per_week=7,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
        ),
        lawn_area_m2=100.0,
    )

    assert summary.scheduled_events == 30
    assert summary.water_events == 30
    assert summary.recommended_volume_l == pytest.approx(summary.baseline_volume_l)
    assert summary.avoided_volume_l == pytest.approx(0.0)
    assert summary.avoided_percent == pytest.approx(0.0)
    for step in summary.steps:
        assert step.recommended_applied_mm <= step.baseline_applied_mm


def test_replay_declines_hot_start_or_bad_history() -> None:
    schedule = baseline_schedule_dates(
        anchor=ANCHOR,
        events_per_week=3,
        window_start=WINDOW_START,
        window_end=WINDOW_END,
    )

    with pytest.raises(EngineInputError, match="at least one day"):
        simulate_backtest(
            config=_config(),
            history=[],
            schedule_dates=schedule,
            lawn_area_m2=100.0,
        )

    with pytest.raises(EngineInputError, match="duplicate dates"):
        simulate_backtest(
            config=_config(),
            history=[_history(1.0)[0], _history(1.0)[0]],
            schedule_dates=schedule,
            lawn_area_m2=100.0,
        )

    with pytest.raises(EngineInputError, match="lawn_area_m2"):
        simulate_backtest(
            config=_config(),
            history=_history(1.0),
            schedule_dates=schedule,
            lawn_area_m2=0.0,
        )


def test_history_day_rejects_negative_values() -> None:
    with pytest.raises(EngineInputError, match="et0_mm"):
        HistoryDay(date=WINDOW_START, et0_mm=-1.0, precipitation_mm=0.0)

    with pytest.raises(EngineInputError, match="precipitation_mm"):
        HistoryDay(date=WINDOW_START, et0_mm=0.0, precipitation_mm=-0.5)
