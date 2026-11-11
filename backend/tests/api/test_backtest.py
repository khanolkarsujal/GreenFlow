"""Backtest route tests with mocked Open-Meteo history.

Every expected number below is hand-checked from the test-only constants
and a synthetic weather series. The values are not product constants.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.backtest import get_history_client, get_now
from app.api.recommendations import get_constants_resolver
from app.db.database import Base, get_db
from app.engine.models import IrrigationConstants
from app.main import app
from app.services.open_meteo import WeatherDay, WeatherUnavailableError

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, expire_on_commit=False)

WINDOW_START = date(2026, 1, 1)
WINDOW_DAYS = 30

# Test-only constants: TAW = (0.30 - 0.10) * 0.20 * 1000 = 40 mm,
# RAW = 0.5 * 40 = 20 mm, skip threshold = 0.5 * 20 = 10 mm,
# efficiency 1.0 so demand and application are the same number.
TEST_CONSTANTS = IrrigationConstants(
    crop_coefficient=1.0,
    field_capacity=0.30,
    wilting_point=0.10,
    root_depth_m=0.20,
    depletion_fraction=0.5,
    skip_fraction=0.5,
    horizon_cap_days=7,
    irrigation_efficiency=1.0,
    max_application_mm=40.0,
    source_notes=("Test-only values; not product constants.",),
)


def _history(*, et0_mm: float = 1.0, precipitation_mm: float = 0.0) -> list[WeatherDay]:
    return [
        WeatherDay(
            date=WINDOW_START + timedelta(days=offset),
            precipitation_mm=precipitation_mm,
            temp_max_c=20.0,
            temp_min_c=10.0,
            wind_max_ms=1.0,
            et0_mm=et0_mm,
            is_forecast=False,
        )
        for offset in range(WINDOW_DAYS)
    ]


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "location_label": "Test back yard",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "lawn_area_m2": 120.0,
        "grass_type": "test grass",
        "soil_type": "test soil",
        "sprinkler_type": "test sprinkler",
        # 10 mm/h for 90 minutes = 15 mm per baseline event.
        "precipitation_rate_mm_per_hour": 10.0,
        "baseline_minutes_per_event": 90,
        "events_per_week": 7,
        "last_watered_date": WINDOW_START.isoformat(),
        "last_watered_minutes": 90,
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, **overrides: object) -> dict[str, Any]:
    response = client.post("/profiles", json=_payload(**overrides))
    assert response.status_code == 201
    return response.json()


def _use_history(days: list[WeatherDay]) -> None:
    def fake_history(latitude: float, longitude: float) -> list[WeatherDay]:
        return days

    app.dependency_overrides[get_history_client] = lambda: fake_history


def _fail_history(latitude: float, longitude: float) -> list[WeatherDay]:
    raise AssertionError(f"history client must not be called for {latitude}, {longitude}")


@pytest.fixture
def client() -> Iterator[TestClient]:
    Base.metadata.drop_all(bind=TEST_ENGINE)
    Base.metadata.create_all(bind=TEST_ENGINE)

    def _get_test_db() -> Iterator[Session]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_test_db
    app.dependency_overrides[get_history_client] = lambda: _fail_history
    app.dependency_overrides[get_constants_resolver] = lambda: lambda profile: TEST_CONSTANTS
    app.dependency_overrides[get_now] = lambda: datetime(2026, 2, 1, 7, 0, tzinfo=UTC)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_backtest_replays_daily_schedule_against_hand_checked_numbers(client: TestClient) -> None:
    # A watering every day with 1 mm/day of demand and no rain.
    # Day 1 starts at the 20 mm refill point: it is above the 10 mm skip
    # threshold and needs 20 mm, which exceeds the 15 mm baseline, so WATER.
    # Days 2-6 stay at or below 10 mm, so SKIP. Day 7 reaches 11 mm, which
    # is under the baseline, so REDUCE at 11 mm and the cycle repeats at
    # days 18 and 29. Total applied: 15 + 11 + 11 + 11 = 48 mm.
    _use_history(_history())
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/backtest")

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "simulated_backtest"
    assert body["tag"] == "Simulated, not your confirmed actions"
    assert body["generated_at"].startswith("2026-02-01")
    assert body["window_days"] == 30
    assert body["start_date"] == "2026-01-01"
    assert body["end_date"] == "2026-01-30"
    assert body["scheduled_events"] == 30
    assert (body["skip_events"], body["reduce_events"], body["water_events"]) == (26, 3, 1)
    # 15 mm x 120 m2 = 1800 L per baseline event.
    assert body["estimated_baseline_litres"] == pytest.approx(30 * 15 * 120.0)
    assert body["estimated_recommended_litres"] == pytest.approx(48 * 120.0)
    assert body["estimated_water_avoided_litres"] == pytest.approx((450 - 48) * 120.0)
    assert body["estimated_avoided_percent"] == pytest.approx((450 - 48) / 450 * 100)
    assert body["assumptions"][0].startswith("Simulated, not your confirmed actions")
    assert any(source["id"] == "open-meteo-history" for source in body["sources"])
    assert any("metered" in text for text in body["assumptions"])
    assert any("upper bound" in text for text in body["limitations"])


def test_backtest_inputs_report_the_numbers_behind_the_replay(client: TestClient) -> None:
    _use_history(_history(et0_mm=2.0, precipitation_mm=0.5))
    profile = _create(client)

    body = client.get(f"/profiles/{profile['id']}/backtest").json()

    assert body["inputs"] == {
        "lawn_area_m2": 120.0,
        "precipitation_rate_mm_per_hour": 10.0,
        "baseline_minutes_per_event": 90,
        "baseline_event_mm": 15.0,
        "events_per_week": 7,
        "irrigation_efficiency": 1.0,
        "taw_mm": 40.0,
        "raw_mm": 20.0,
        "skip_threshold_mm": 10.0,
        "total_et0_mm": 60.0,
        "total_rainfall_mm": 15.0,
    }


def test_backtest_steps_start_at_the_refill_point_and_have_no_lookahead(
    client: TestClient,
) -> None:
    _use_history(_history())
    profile = _create(client)

    body = client.get(f"/profiles/{profile['id']}/backtest").json()
    steps = body["steps"]

    assert len(steps) == 30
    assert [step["date"] for step in steps] == [
        (WINDOW_START + timedelta(days=offset)).isoformat() for offset in range(30)
    ]
    assert steps[0]["depletion_start_mm"] == pytest.approx(20.0)
    assert steps[0]["scheduled"] is True
    assert steps[0]["state"] == "WATER"
    assert steps[0]["baseline_applied_mm"] == pytest.approx(15.0)
    assert steps[0]["recommended_applied_mm"] == pytest.approx(15.0)
    # Depletion at the end of one day is the depletion at the start of the next.
    for previous, following in zip(steps, steps[1:], strict=False):
        assert following["depletion_start_mm"] == pytest.approx(previous["depletion_end_mm"])
    # Only scheduled days carry a state, and only they apply water.
    for step in steps:
        if not step["scheduled"]:
            assert step["state"] is None
            assert step["baseline_applied_mm"] == 0.0
            assert step["recommended_applied_mm"] == 0.0


def test_backtest_skips_rain_fed_days_after_the_first_refill(client: TestClient) -> None:
    # 1 mm/day of demand, 5 mm/day of rain. The window opens at the 20 mm
    # refill point, so the very first scheduled day still gets a full
    # baseline event; every later day is already wet and is skipped.
    # Applied: 15 mm against a 450 mm baseline.
    _use_history(_history(et0_mm=1.0, precipitation_mm=5.0))
    profile = _create(client)

    body = client.get(f"/profiles/{profile['id']}/backtest").json()

    assert body["scheduled_events"] == 30
    assert body["skip_events"] == 29
    assert body["reduce_events"] == 0
    assert body["water_events"] == 1
    assert body["estimated_recommended_litres"] == pytest.approx(15 * 120.0)
    assert body["estimated_water_avoided_litres"] == pytest.approx((450 - 15) * 120.0)
    assert body["estimated_avoided_percent"] == pytest.approx((450 - 15) / 450 * 100)


def test_backtest_uses_the_evenly_spaced_weekly_schedule(client: TestClient) -> None:
    # Once a week, anchored on the last watering date: 5 events in a
    # 30-day window (days 1, 8, 15, 22, 29).
    _use_history(_history())
    profile = _create(client, events_per_week=1)

    body = client.get(f"/profiles/{profile['id']}/backtest").json()
    scheduled = [step["date"] for step in body["steps"] if step["scheduled"]]

    assert body["scheduled_events"] == 5
    assert scheduled == [
        "2026-01-01",
        "2026-01-08",
        "2026-01-15",
        "2026-01-22",
        "2026-01-29",
    ]
    assert body["estimated_baseline_litres"] == pytest.approx(5 * 15 * 120.0)


def test_backtest_is_separate_from_confirmed_savings(client: TestClient) -> None:
    _use_history(_history())
    profile = _create(client)

    backtest = client.get(f"/profiles/{profile['id']}/backtest").json()
    savings = client.get(f"/profiles/{profile['id']}/savings").json()

    assert backtest["estimated_water_avoided_litres"] > 0
    # Nothing was confirmed, so the confirmed-only total stays at zero.
    assert savings["confirmed_count"] == 0
    assert savings["estimated_water_avoided_litres"] == pytest.approx(0.0)


def test_backtest_returns_503_when_history_is_unavailable(client: TestClient) -> None:
    def unavailable(latitude: float, longitude: float) -> list[WeatherDay]:
        raise WeatherUnavailableError("Open-Meteo could not be reached.")

    app.dependency_overrides[get_history_client] = lambda: unavailable
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/backtest")

    assert response.status_code == 503
    body = response.json()
    assert body["state"] == "CANNOT_BACKTEST"
    assert body["code"] == "weather_unavailable"
    assert body["reason"] == "Open-Meteo could not be reached."


def test_backtest_returns_503_when_history_is_too_short(client: TestClient) -> None:
    _use_history(_history()[:3])
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/backtest")

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "insufficient_history"
    assert "at least 7" in body["reason"]


def test_backtest_returns_503_when_constants_are_missing(client: TestClient) -> None:
    _use_history(_history())
    app.dependency_overrides[get_constants_resolver] = lambda: lambda profile: None
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/backtest")

    assert response.status_code == 503
    assert response.json()["code"] == "constants_unavailable"


def test_backtest_returns_404_for_an_unknown_profile(client: TestClient) -> None:
    response = client.get("/profiles/does-not-exist/backtest")

    assert response.status_code == 404
    assert response.json()["code"] == "profile_not_found"
