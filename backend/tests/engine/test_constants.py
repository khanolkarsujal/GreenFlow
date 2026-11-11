"""Cited constants: mappings, arithmetic, and citations."""

from __future__ import annotations

from datetime import date

import pytest

from app.db.models import Profile
from app.engine.constants import (
    CONSTANT_SOURCES,
    CSU_EFFICIENCY_URL,
    FAO_56_TABLE_12,
    FAO_56_TABLE_19,
    FAO_56_TABLE_22,
    PENN_STATE_ROOT_DEPTH_URL,
    ConstantsUnavailable,
    resolve_constants,
)


def _profile(
    *,
    grass: str = "fescue",
    soil: str = "loamy",
    precipitation_rate: float = 30.0,
    baseline_minutes: int = 30,
) -> Profile:
    return Profile(
        id="profile-1",
        location_label="Test lawn",
        latitude=37.77,
        longitude=-122.42,
        lawn_area_m2=120.0,
        grass_type=grass,
        soil_type=soil,
        sprinkler_type="rotor",
        precipitation_rate_mm_per_hour=precipitation_rate,
        baseline_minutes_per_event=baseline_minutes,
        events_per_week=3,
        last_watered_date=date(2026, 1, 7),
        last_watered_minutes=30,
    )


def test_cool_season_grass_uses_table_12_and_table_22() -> None:
    constants = resolve_constants(_profile(grass="fescue"))

    assert constants.crop_coefficient == pytest.approx(0.95)
    assert constants.depletion_fraction == pytest.approx(0.40)
    assert any(FAO_56_TABLE_12 in note for note in constants.source_notes)
    assert any(FAO_56_TABLE_22 in note for note in constants.source_notes)


def test_warm_season_grass_uses_table_12_and_table_22() -> None:
    constants = resolve_constants(_profile(grass="bermuda"))

    assert constants.crop_coefficient == pytest.approx(0.85)
    assert constants.depletion_fraction == pytest.approx(0.50)


@pytest.mark.parametrize(
    ("soil", "field_capacity", "wilting_point"),
    [
        ("sandy", 0.12, 0.045),
        ("loamy", 0.25, 0.12),
        ("silty", 0.29, 0.15),
        ("clay", 0.36, 0.22),
    ],
)
def test_soil_midpoints_come_from_table_19(
    soil: str, field_capacity: float, wilting_point: float
) -> None:
    constants = resolve_constants(_profile(soil=soil))

    assert constants.field_capacity == pytest.approx(field_capacity)
    assert constants.wilting_point == pytest.approx(wilting_point)
    assert any(FAO_56_TABLE_19 in note for note in constants.source_notes)


def test_total_available_water_matches_cited_values() -> None:
    constants = resolve_constants(_profile(soil="loamy"))

    taw_mm = (constants.field_capacity - constants.wilting_point) * constants.root_depth_m * 1000

    assert taw_mm == pytest.approx(19.5)
    assert constants.root_depth_m == pytest.approx(0.15)


def test_baseline_event_depth_becomes_the_maximum_application() -> None:
    constants = resolve_constants(_profile(precipitation_rate=30.0, baseline_minutes=30))

    assert constants.max_application_mm == pytest.approx(15.0)


def test_sources_are_cited_and_linked() -> None:
    constants = resolve_constants(_profile())

    source_ids = {source.id for source in constants.sources}
    assert source_ids == {source.id for source in CONSTANT_SOURCES}
    assert "fao56-table-12" in source_ids
    assert "fao56-table-22" in source_ids
    assert "fao56-table-19" in source_ids
    assert "penn-state-root-depth" in source_ids
    assert "csu-efficiency" in source_ids

    by_id = {source.id: source for source in constants.sources}
    assert by_id["penn-state-root-depth"].url == PENN_STATE_ROOT_DEPTH_URL
    assert by_id["csu-efficiency"].url == CSU_EFFICIENCY_URL
    assert "Table 19" in by_id["fao56-table-19"].citation
    assert "Table 12" in by_id["fao56-table-12"].citation
    assert "Table 22" in by_id["fao56-table-22"].citation


def test_policies_are_recorded_as_policies() -> None:
    constants = resolve_constants(_profile())

    assert constants.skip_fraction == pytest.approx(0.50)
    assert constants.horizon_cap_days == 7
    assert constants.irrigation_efficiency == pytest.approx(0.60)
    assert any("product policies" in note for note in constants.source_notes)


@pytest.mark.parametrize("soil", ["not-sure", "gravel", ""])
def test_unknown_soil_is_unavailable(soil: str) -> None:
    with pytest.raises(ConstantsUnavailable, match="soil type"):
        resolve_constants(_profile(soil=soil))


@pytest.mark.parametrize("grass", ["other", "clover", ""])
def test_unknown_grass_is_unavailable(grass: str) -> None:
    with pytest.raises(ConstantsUnavailable, match="grass type"):
        resolve_constants(_profile(grass=grass))


def test_zero_baseline_depth_is_unavailable() -> None:
    with pytest.raises(ConstantsUnavailable, match="no depth"):
        resolve_constants(_profile(precipitation_rate=0.0, baseline_minutes=30))
