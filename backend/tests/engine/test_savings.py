"""Tests for the estimated-water-avoided calculation.

Every test builds its own fixture. Values are test values chosen
so the arithmetic can be checked by hand; they are not product
constants.
"""

from __future__ import annotations

import pytest

from app.engine.models import EngineInputError, SavingsBaseline
from app.engine.savings import estimate_savings


def test_one_week_window() -> None:
    # Events in window = 2 events/week * 7 / 7 = 2
    # V_base = 10 mm * 2 events * 100 m² = 2,000 L
    # Recommended = 8 + 0 + 0 + 4 + 0 + 0 + 0 = 12 mm
    # V_rec = 12 mm * 100 m² = 1,200 L
    # Estimated avoided = 2,000 - 1,200 = 800 L
    result = estimate_savings(
        baseline_event_depth_mm=10.0,
        baseline_events_per_week=2.0,
        window_days=7,
        lawn_area_m2=100.0,
        recommended_depths_mm=[8.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0],
        irrigation_efficiency=0.8,
    )

    assert result.baseline.event_depth_mm == pytest.approx(10.0)
    assert result.baseline.events_per_week == pytest.approx(2.0)
    assert result.baseline.events_in_window == pytest.approx(2.0)
    assert result.window_days == 7
    assert result.lawn_area_m2 == pytest.approx(100.0)
    assert result.irrigation_efficiency == pytest.approx(0.8)
    assert result.baseline_volume_l == pytest.approx(2000.0)
    assert result.recommended_volume_l == pytest.approx(1200.0)
    assert result.estimated_water_avoided_l == pytest.approx(800.0)


def test_two_week_window() -> None:
    # Events in window = 3 events/week * 14 / 7 = 6
    # V_base = 5 mm * 6 events * 50 m² = 1,500 L
    # Recommended = 2 + 0 + 0 + 2 + 0 + 0 + 2 + 0 + 0 + 0 + 0 + 0 + 4 + 0 = 10 mm
    # V_rec = 10 mm * 50 m² = 500 L
    # Estimated avoided = 1,500 - 500 = 1,000 L
    result = estimate_savings(
        baseline_event_depth_mm=5.0,
        baseline_events_per_week=3.0,
        window_days=14,
        lawn_area_m2=50.0,
        recommended_depths_mm=[
            2.0,
            0.0,
            0.0,
            2.0,
            0.0,
            0.0,
            2.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            4.0,
            0.0,
        ],
        irrigation_efficiency=0.75,
    )

    assert result.baseline.events_in_window == pytest.approx(6.0)
    assert result.window_days == 14
    assert result.baseline_volume_l == pytest.approx(1500.0)
    assert result.recommended_volume_l == pytest.approx(500.0)
    assert result.estimated_water_avoided_l == pytest.approx(1000.0)


def test_recommended_above_baseline_clamps_avoided_to_zero() -> None:
    # Events in window = 2 events/week * 7 / 7 = 2
    # V_base = 4 mm * 2 events * 100 m² = 800 L
    # Recommended = 10 + 0 + 0 + 10 + 0 + 0 + 0 = 20 mm
    # V_rec = 20 mm * 100 m² = 2,000 L
    # Difference = 800 - 2,000 = -1,200 L, clamped to 0 L
    result = estimate_savings(
        baseline_event_depth_mm=4.0,
        baseline_events_per_week=2.0,
        window_days=7,
        lawn_area_m2=100.0,
        recommended_depths_mm=[10.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0],
        irrigation_efficiency=0.9,
    )

    assert result.baseline_volume_l == pytest.approx(800.0)
    assert result.recommended_volume_l == pytest.approx(2000.0)
    assert result.estimated_water_avoided_l == pytest.approx(0.0)


def test_zero_baseline_yields_no_avoided_water() -> None:
    # Baseline depth is 0, so V_base = 0 mm * 2 events * 100 m² = 0 L
    # Recommended = 2 + 0 + 0 + 0 + 0 + 0 + 0 = 2 mm
    # V_rec = 2 mm * 100 m² = 200 L
    # Difference = 0 - 200 = -200 L, clamped to 0 L
    result = estimate_savings(
        baseline_event_depth_mm=0.0,
        baseline_events_per_week=2.0,
        window_days=7,
        lawn_area_m2=100.0,
        recommended_depths_mm=[2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        irrigation_efficiency=0.8,
    )

    assert result.baseline.event_depth_mm == pytest.approx(0.0)
    assert result.baseline.events_in_window == pytest.approx(2.0)
    assert result.baseline_volume_l == pytest.approx(0.0)
    assert result.recommended_volume_l == pytest.approx(200.0)
    assert result.estimated_water_avoided_l == pytest.approx(0.0)


def test_no_recommended_water_avoids_the_full_baseline() -> None:
    # Events in window = 1 event/week * 7 / 7 = 1
    # V_base = 10 mm * 1 event * 60 m² = 600 L
    # Recommended = 0 mm, so V_rec = 0 L
    # Estimated avoided = 600 - 0 = 600 L
    result = estimate_savings(
        baseline_event_depth_mm=10.0,
        baseline_events_per_week=1.0,
        window_days=7,
        lawn_area_m2=60.0,
        recommended_depths_mm=[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        irrigation_efficiency=0.7,
    )

    assert result.baseline_volume_l == pytest.approx(600.0)
    assert result.recommended_volume_l == pytest.approx(0.0)
    assert result.estimated_water_avoided_l == pytest.approx(600.0)


def test_result_exposes_baseline_and_assumptions() -> None:
    # Same arithmetic as the one-week fixture; this test checks the
    # context the UI needs and the required wording.
    result = estimate_savings(
        baseline_event_depth_mm=10.0,
        baseline_events_per_week=2.0,
        window_days=7,
        lawn_area_m2=100.0,
        recommended_depths_mm=[8.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0],
        irrigation_efficiency=0.8,
    )

    assert result.baseline == SavingsBaseline(
        event_depth_mm=10.0,
        events_per_week=2.0,
        events_in_window=2.0,
    )
    assert result.window_days == 7
    assert result.lawn_area_m2 == pytest.approx(100.0)
    assert result.irrigation_efficiency == pytest.approx(0.8)
    assert len(result.assumptions) >= 3
    for text in result.assumptions:
        lowered = text.lower()
        assert "saved" not in lowered
        assert "measured" not in lowered


def test_recommended_depth_count_must_match_window() -> None:
    # 6 depths for a 7-day window is a malformed series.
    with pytest.raises(EngineInputError):
        estimate_savings(
            baseline_event_depth_mm=10.0,
            baseline_events_per_week=2.0,
            window_days=7,
            lawn_area_m2=100.0,
            recommended_depths_mm=[8.0, 0.0, 0.0, 4.0, 0.0, 0.0],
            irrigation_efficiency=0.8,
        )


def test_negative_recommended_depth_is_rejected() -> None:
    # A negative applied depth is impossible.
    with pytest.raises(EngineInputError):
        estimate_savings(
            baseline_event_depth_mm=10.0,
            baseline_events_per_week=2.0,
            window_days=7,
            lawn_area_m2=100.0,
            recommended_depths_mm=[8.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0],
            irrigation_efficiency=0.8,
        )


def test_zero_irrigation_efficiency_is_rejected() -> None:
    # Efficiency must be in (0, 1].
    with pytest.raises(EngineInputError):
        estimate_savings(
            baseline_event_depth_mm=10.0,
            baseline_events_per_week=2.0,
            window_days=7,
            lawn_area_m2=100.0,
            recommended_depths_mm=[8.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0],
            irrigation_efficiency=0.0,
        )


def test_zero_window_days_is_rejected() -> None:
    # A window must be at least one day.
    with pytest.raises(EngineInputError):
        estimate_savings(
            baseline_event_depth_mm=10.0,
            baseline_events_per_week=2.0,
            window_days=0,
            lawn_area_m2=100.0,
            recommended_depths_mm=[],
            irrigation_efficiency=0.8,
        )
