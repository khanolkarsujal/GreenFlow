"""Tests for the pure water-balance engine.

Every test builds its own fixture. The numeric values are test
values chosen so the arithmetic is easy to check by hand; they
are not product constants. Each expected value is written as
arithmetic in a comment.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.engine.models import (
    EngineConfig,
    EngineDay,
    EngineInputError,
    RecommendationState,
)
from app.engine.water_balance import (
    compute_horizon,
    compute_raw,
    compute_taw,
    depletion_after_watering,
    effective_rainfall,
    recommend,
    update_depletion,
)


def test_taw_and_raw() -> None:
    # TAW = (0.30 - 0.10) * 0.15 m * 1000 = 30.0 mm
    # RAW = 0.5 * 30.0 = 15.0 mm
    config = EngineConfig(
        crop_coefficient=0.6,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.15,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=2.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.75,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=0.0,
    )

    assert compute_taw(config) == pytest.approx(30.0)
    assert compute_raw(config) == pytest.approx(15.0)


def test_depletion_after_watering_starts_from_raw() -> None:
    # clamp(RAW - applied, 0, TAW) = clamp(15 - 5, 0, 30) = 10.0 mm
    assert depletion_after_watering(taw_mm=30.0, raw_mm=15.0, applied_mm=5.0) == pytest.approx(10.0)


def test_depletion_after_watering_clamps_at_zero() -> None:
    # clamp(15 - 20, 0, 30) = 0.0 mm
    assert depletion_after_watering(taw_mm=30.0, raw_mm=15.0, applied_mm=20.0) == pytest.approx(0.0)


def test_depletion_after_watering_without_application_is_raw() -> None:
    # clamp(15 - 0, 0, 30) = 15.0 mm
    assert depletion_after_watering(taw_mm=30.0, raw_mm=15.0, applied_mm=0.0) == pytest.approx(15.0)


def test_horizon_from_two_events_per_week() -> None:
    # ceil(7 / 2) = 4; min(7, 4) = 4 days
    config = EngineConfig(
        crop_coefficient=0.6,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=2.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.75,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=0.0,
    )

    assert compute_horizon(config) == 4


def test_horizon_is_capped() -> None:
    # ceil(7 / 1) = 7; min(5, 7) = 5 days
    config = EngineConfig(
        crop_coefficient=0.6,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=1.0,
        horizon_cap_days=5,
        irrigation_efficiency=0.75,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=0.0,
    )

    assert compute_horizon(config) == 5


def test_horizon_has_a_minimum_of_one_day() -> None:
    # ceil(7 / 10) = 1; min(7, max(1, 1)) = 1 day
    config = EngineConfig(
        crop_coefficient=0.6,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=10.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.75,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=0.0,
    )

    assert compute_horizon(config) == 1


def test_dry_day_adds_crop_demand() -> None:
    # D = 0 + 0.5 * 4 - min(0, 0) - 0 = 2.0 mm
    day = EngineDay(date=date(2026, 11, 4), et0_mm=4.0, precipitation_mm=0.0, irrigation_mm=0.0)

    assert update_depletion(0.0, day, crop_coefficient=0.5, taw_mm=20.0) == pytest.approx(2.0)


def test_rain_smaller_than_depletion_refills_partially() -> None:
    # ETc = 0.5 * 4 = 2.0; P_eff = min(1, 5) = 1.0; D = 5 + 2 - 1 - 0 = 6.0 mm
    day = EngineDay(date=date(2026, 11, 4), et0_mm=4.0, precipitation_mm=1.0, irrigation_mm=0.0)

    assert update_depletion(5.0, day, crop_coefficient=0.5, taw_mm=20.0) == pytest.approx(6.0)


def test_rain_larger_than_depletion_clamps_at_zero() -> None:
    # ETc = 0; P_eff = min(12, 5) = 5.0; D = 5 + 0 - 5 - 0 = 0.0 mm
    day = EngineDay(date=date(2026, 11, 4), et0_mm=0.0, precipitation_mm=12.0, irrigation_mm=0.0)

    assert update_depletion(5.0, day, crop_coefficient=0.5, taw_mm=20.0) == pytest.approx(0.0)


def test_irrigation_reduces_depletion() -> None:
    # ETc = 0.5 * 4 = 2.0; P_eff = 0; D = 5 + 2 - 0 - 4 = 3.0 mm
    day = EngineDay(date=date(2026, 11, 4), et0_mm=4.0, precipitation_mm=0.0, irrigation_mm=4.0)

    assert update_depletion(5.0, day, crop_coefficient=0.5, taw_mm=20.0) == pytest.approx(3.0)


def test_depletion_clamps_at_total_available_water() -> None:
    # ETc = 0.5 * 4 = 2.0; D = 19 + 2 - 0 - 0 = 21.0, clamped to TAW = 20.0 mm
    day = EngineDay(date=date(2026, 11, 4), et0_mm=4.0, precipitation_mm=0.0, irrigation_mm=0.0)

    assert update_depletion(19.0, day, crop_coefficient=0.5, taw_mm=20.0) == pytest.approx(20.0)


def test_effective_rainfall_never_exceeds_previous_depletion() -> None:
    # min(8, 3) = 3.0 mm can refill; the remaining 5.0 mm is assumed to drain
    assert effective_rainfall(8.0, 3.0) == pytest.approx(3.0)


def test_dry_lawn_with_heavy_forecast_rain_skips() -> None:
    # TAW = (0.30 - 0.10) * 0.10 * 1000 = 20.0 mm
    # RAW = 0.5 * 20 = 10.0 mm; T_skip = 0.3 * 10 = 3.0 mm
    # H = ceil(7 / 4) = 2
    # Day 1: ETc = 0.5 * 2 = 1.0; P_eff = min(10, 12) = 10; D_fc_1 = 12 + 1 - 10 = 3.0
    # Day 2: ETc = 1.0; P_eff = min(10, 3) = 3;  D_fc_2 = 3 + 1 - 3 = 1.0
    # D_proj_max = max(3.0, 1.0) = 3.0 (today's D = 12 is excluded)
    # 3.0 <= 3.0 -> SKIP with no irrigation
    config = EngineConfig(
        crop_coefficient=0.5,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=4.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.8,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=12.0,
    )
    forecast = [
        EngineDay(
            date=date(2026, 11, 5),
            et0_mm=2.0,
            precipitation_mm=10.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
        EngineDay(
            date=date(2026, 11, 6),
            et0_mm=2.0,
            precipitation_mm=10.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
    ]

    result = recommend(config, forecast)

    assert result.state is RecommendationState.SKIP
    assert result.recommended_depth_mm == pytest.approx(0.0)
    assert result.horizon_days == 2
    assert result.projected_depletions_mm == pytest.approx((3.0, 1.0))
    assert result.projected_max_depletion_mm == pytest.approx(3.0)


def test_dry_forecast_waters() -> None:
    # TAW = (0.30 - 0.10) * 0.10 * 1000 = 20.0 mm
    # RAW = 1.0 * 20 = 20.0 mm; T_skip = 0.3 * 20 = 6.0 mm
    # H = ceil(7 / 4) = 2
    # Day 1: ETc = 0.5 * 8 = 4.0; D_fc_1 = 2 + 4 = 6.0
    # Day 2: ETc = 4.0;          D_fc_2 = 6 + 4 = 10.0
    # D_proj_max = 10.0 > 6.0; I_rec = min(10 / 0.8, 20) = 12.5 mm
    # 12.5 >= 10.0 -> WATER
    config = EngineConfig(
        crop_coefficient=0.5,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=1.0,
        skip_fraction=0.3,
        baseline_events_per_week=4.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.8,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=2.0,
    )
    forecast = [
        EngineDay(
            date=date(2026, 11, 5),
            et0_mm=8.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
        EngineDay(
            date=date(2026, 11, 6),
            et0_mm=8.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
    ]

    result = recommend(config, forecast)

    assert result.state is RecommendationState.WATER
    assert result.projected_depletions_mm == pytest.approx((6.0, 10.0))
    assert result.projected_max_depletion_mm == pytest.approx(10.0)
    assert result.skip_threshold_mm == pytest.approx(6.0)
    assert result.recommended_depth_mm == pytest.approx(12.5)


def test_dry_forecast_below_a_full_event_reduces() -> None:
    # TAW = (0.30 - 0.10) * 0.10 * 1000 = 20.0 mm
    # RAW = 1.0 * 20 = 20.0 mm; T_skip = 0.25 * 20 = 5.0 mm
    # H = ceil(7 / 4) = 2
    # Day 1: ETc = 0.5 * 4 = 2.0; D_fc_1 = 2 + 2 = 4.0
    # Day 2: ETc = 2.0;          D_fc_2 = 4 + 2 = 6.0
    # D_proj_max = 6.0 > 5.0; I_rec = min(6 / 0.8, 20) = 7.5 mm
    # 7.5 < 10.0 -> REDUCE
    config = EngineConfig(
        crop_coefficient=0.5,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=1.0,
        skip_fraction=0.25,
        baseline_events_per_week=4.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.8,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=2.0,
    )
    forecast = [
        EngineDay(
            date=date(2026, 11, 5),
            et0_mm=4.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
        EngineDay(
            date=date(2026, 11, 6),
            et0_mm=4.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
    ]

    result = recommend(config, forecast)

    assert result.state is RecommendationState.REDUCE
    assert result.projected_depletions_mm == pytest.approx((4.0, 6.0))
    assert result.projected_max_depletion_mm == pytest.approx(6.0)
    assert result.skip_threshold_mm == pytest.approx(5.0)
    assert result.recommended_depth_mm == pytest.approx(7.5)


def test_zero_irrigation_efficiency_is_rejected() -> None:
    # Same soil as the TAW test, but eff = 0 would divide by zero.
    with pytest.raises(EngineInputError):
        EngineConfig(
            crop_coefficient=0.6,
            field_capacity=0.30,
            wilting_point=0.10,
            root_depth_m=0.10,
            depletion_fraction=0.5,
            skip_fraction=0.3,
            baseline_events_per_week=2.0,
            horizon_cap_days=7,
            irrigation_efficiency=0.0,
            max_application_mm=20.0,
            baseline_event_mm=10.0,
            initial_depletion_mm=0.0,
        )


def test_skip_fraction_above_one_is_rejected() -> None:
    # f_skip = 1.2 is outside [0, 1].
    with pytest.raises(EngineInputError):
        EngineConfig(
            crop_coefficient=0.6,
            field_capacity=0.30,
            wilting_point=0.10,
            root_depth_m=0.10,
            depletion_fraction=0.5,
            skip_fraction=1.2,
            baseline_events_per_week=2.0,
            horizon_cap_days=7,
            irrigation_efficiency=0.75,
            max_application_mm=20.0,
            baseline_event_mm=10.0,
            initial_depletion_mm=0.0,
        )


def test_negative_reference_et_is_rejected() -> None:
    # ET0 cannot be negative.
    with pytest.raises(EngineInputError):
        EngineDay(date=date(2026, 11, 4), et0_mm=-1.0, precipitation_mm=0.0, irrigation_mm=0.0)


def test_negative_precipitation_is_rejected() -> None:
    # Precipitation cannot be negative.
    with pytest.raises(EngineInputError):
        EngineDay(date=date(2026, 11, 4), et0_mm=4.0, precipitation_mm=-2.0, irrigation_mm=0.0)


def test_inverted_soil_water_contents_are_rejected() -> None:
    # Wilting point (0.30) must be below field capacity (0.10 is invalid).
    with pytest.raises(EngineInputError):
        EngineConfig(
            crop_coefficient=0.6,
            field_capacity=0.10,
            wilting_point=0.30,
            root_depth_m=0.10,
            depletion_fraction=0.5,
            skip_fraction=0.3,
            baseline_events_per_week=2.0,
            horizon_cap_days=7,
            irrigation_efficiency=0.75,
            max_application_mm=20.0,
            baseline_event_mm=10.0,
            initial_depletion_mm=0.0,
        )


def test_initial_depletion_above_taw_is_rejected() -> None:
    # TAW = (0.30 - 0.10) * 0.10 * 1000 = 20.0 mm; 21.0 mm is impossible.
    with pytest.raises(EngineInputError):
        EngineConfig(
            crop_coefficient=0.6,
            field_capacity=0.30,
            wilting_point=0.10,
            root_depth_m=0.10,
            depletion_fraction=0.5,
            skip_fraction=0.3,
            baseline_events_per_week=2.0,
            horizon_cap_days=7,
            irrigation_efficiency=0.75,
            max_application_mm=20.0,
            baseline_event_mm=10.0,
            initial_depletion_mm=21.0,
        )


def test_fewer_forecast_days_than_horizon_is_rejected() -> None:
    # H = ceil(7 / 2) = 4, but only 3 forecast days are supplied.
    config = EngineConfig(
        crop_coefficient=0.6,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=2.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.75,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=0.0,
    )
    forecast = [
        EngineDay(
            date=date(2026, 11, 5 + offset),
            et0_mm=4.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=True,
        )
        for offset in range(3)
    ]

    with pytest.raises(EngineInputError):
        recommend(config, forecast)


def test_unmarked_forecast_day_is_rejected() -> None:
    # H = ceil(7 / 4) = 2; the second day is not marked as a forecast.
    config = EngineConfig(
        crop_coefficient=0.5,
        field_capacity=0.30,
        wilting_point=0.10,
        root_depth_m=0.10,
        depletion_fraction=0.5,
        skip_fraction=0.3,
        baseline_events_per_week=4.0,
        horizon_cap_days=7,
        irrigation_efficiency=0.8,
        max_application_mm=20.0,
        baseline_event_mm=10.0,
        initial_depletion_mm=0.0,
    )
    forecast = [
        EngineDay(
            date=date(2026, 11, 5),
            et0_mm=2.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=True,
        ),
        EngineDay(
            date=date(2026, 11, 6),
            et0_mm=2.0,
            precipitation_mm=0.0,
            irrigation_mm=0.0,
            is_forecast=False,
        ),
    ]

    with pytest.raises(EngineInputError):
        recommend(config, forecast)
