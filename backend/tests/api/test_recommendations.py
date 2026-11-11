"""Recommendation route tests with mocked weather and test-only constants."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.recommendations import (
    get_constants_resolver,
    get_now,
    get_weather_client,
)
from app.db.database import Base, get_db
from app.db.models import Recommendation
from app.engine.models import IrrigationConstants
from app.main import app
from app.services.open_meteo import WeatherDay, WeatherUnavailableError

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, expire_on_commit=False)

# Test-only values chosen so the arithmetic is easy to check by
# hand. They are not product constants and are not used by the app.
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


def _weather(*, first_forecast_et0: float = 0.0) -> list[WeatherDay]:
    start = date(2026, 1, 1)
    days: list[WeatherDay] = []
    for offset in range(14):
        is_forecast = offset >= 7
        et0_mm = first_forecast_et0 if offset == 7 else 0.0
        days.append(
            WeatherDay(
                date=start + timedelta(days=offset),
                precipitation_mm=0.0,
                temp_max_c=20.0,
                temp_min_c=10.0,
                wind_max_ms=1.0,
                et0_mm=et0_mm,
                is_forecast=is_forecast,
            )
        )
    return days


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "location_label": "Test back yard",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "lawn_area_m2": 120.0,
        "grass_type": "test grass",
        "soil_type": "test soil",
        "sprinkler_type": "test sprinkler",
        "precipitation_rate_mm_per_hour": 10.0,
        "baseline_minutes_per_event": 90,
        "events_per_week": 1,
        "last_watered_date": "2026-01-07",
        "last_watered_minutes": 60,
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, **overrides: object) -> dict[str, Any]:
    response = client.post("/profiles", json=_payload(**overrides))
    assert response.status_code == 201
    return response.json()


def _unexpected_weather(latitude: float, longitude: float) -> list[WeatherDay]:
    raise AssertionError(f"weather client must not be called for {latitude}, {longitude}")


def _use_weather(days: list[WeatherDay]) -> None:
    def fake_weather(latitude: float, longitude: float) -> list[WeatherDay]:
        return days

    app.dependency_overrides[get_weather_client] = lambda: fake_weather


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
    app.dependency_overrides[get_weather_client] = lambda: _unexpected_weather
    app.dependency_overrides[get_constants_resolver] = lambda: lambda profile: TEST_CONSTANTS
    app.dependency_overrides[get_now] = lambda: datetime(2026, 1, 8, 7, 0, tzinfo=UTC)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_skip_recommendation_is_stored_with_its_inputs(client: TestClient) -> None:
    _use_weather(_weather(first_forecast_et0=0.0))
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 200
    body = response.json()
    assert body["profile_id"] == profile["id"]
    assert body["state"] == "SKIP"
    assert body["recommended_depth_mm"] == pytest.approx(0.0)
    assert body["recommended_minutes"] == 0
    assert body["baseline_minutes"] == 90
    assert body["suggested_change_minutes"] == -90
    assert body["duration"] == {
        "recommended_minutes": 0,
        "baseline_minutes": 90,
        "suggested_change_minutes": -90,
        "depth_mm": 0.0,
        "precipitation_rate_mm_per_hour": 10.0,
        "irrigation_efficiency": 1.0,
        "formula": "minutes = depth_mm ÷ precipitation_rate_mm_per_hour × 60",
        "efficiency_note": (
            "Recommended depth is a gross application: the crop demand is divided by "
            "the irrigation efficiency before the run time is calculated."
        ),
    }
    assert body["freshness"]["mode"] == "live"
    assert body["freshness"]["provider"] == "Open-Meteo"
    assert body["freshness"]["observed_start"] == "2026-01-01"
    assert body["freshness"]["observed_end"] == "2026-01-07"
    assert body["freshness"]["forecast_start"] == "2026-01-08"
    assert body["freshness"]["forecast_end"] == "2026-01-14"
    assert body["freshness"]["forecast_days_available"] == 7
    assert body["freshness"]["horizon_days"] == 7
    assert body["inputs"]["observed"] == [
        {
            "date": "2026-01-07",
            "et0_mm": 0.0,
            "precipitation_mm": 0.0,
            "basis": "observed",
        }
    ]
    assert [source["id"] for source in body["sources"]] == ["open-meteo"]
    assert {factor["role"] for factor in body["factors"]} == {"applied", "context"}
    assert len(body["limitations"]) == 7
    assert "does not control or modify" in body["limitations"][-1]
    assert "not projected to need water" in body["reason"]
    assert body["uncertainty"]
    assert body["assumptions"] == [
        "Baseline schedule: 1 event(s) per week at 15.0 mm per event.",
        "Decision horizon: 7 day(s) until the next scheduled watering.",
        "No irrigation is assumed on forecast days.",
        "The root zone was at the refill point before the last watering.",
        "Weather data is from Open-Meteo and may change.",
        "Test-only values; not product constants.",
    ]

    why = body["why"]
    assert why["initial_depletion_mm"] == pytest.approx(10.0)
    assert why["observed_rainfall_mm"] == pytest.approx(0.0)
    assert why["forecast_rainfall_mm"] == pytest.approx(0.0)
    assert why["forecast_et0_mm"] == pytest.approx(0.0)
    assert why["estimated_crop_demand_mm"] == pytest.approx(0.0)
    assert why["taw_mm"] == pytest.approx(40.0)
    assert why["raw_mm"] == pytest.approx(20.0)
    assert why["skip_threshold_mm"] == pytest.approx(10.0)
    assert why["horizon_days"] == 7
    assert why["projected_depletions_mm"] == pytest.approx([10.0] * 7)
    assert why["projected_max_depletion_mm"] == pytest.approx(10.0)
    assert why["baseline_event_mm"] == pytest.approx(15.0)
    assert why["irrigation_efficiency"] == pytest.approx(1.0)

    with TestingSessionLocal() as session:
        stored = session.execute(select(Recommendation)).scalars().all()

    assert len(stored) == 1
    row = stored[0]
    assert row.id == body["id"]
    assert row.profile_id == profile["id"]
    assert row.state == "SKIP"
    assert row.recommended_minutes == pytest.approx(0.0)
    assert row.baseline_minutes == 90
    assert row.retrieved_at is not None
    assert row.retrieved_at.replace(tzinfo=UTC) == datetime(2026, 1, 8, 7, 0, tzinfo=UTC)
    assert row.weather_mode == "live"
    assert row.limitations == body["limitations"]
    assert row.sources == body["sources"]
    assert row.config["crop_coefficient"] == pytest.approx(1.0)
    assert row.config["initial_depletion_mm"] == pytest.approx(10.0)
    assert row.assumptions == body["assumptions"]
    assert row.observed_inputs == [
        {
            "date": "2026-01-07",
            "et0_mm": 0.0,
            "precipitation_mm": 0.0,
            "basis": "observed",
        }
    ]
    assert row.forecast_inputs == [
        {
            "date": f"2026-01-{day:02d}",
            "et0_mm": 0.0,
            "precipitation_mm": 0.0,
            "basis": "forecast",
        }
        for day in range(8, 15)
    ]
    assert row.profile_inputs["last_watered_date"] == "2026-01-07"
    assert row.profile_inputs["precipitation_rate_mm_per_hour"] == pytest.approx(10.0)


def test_reduce_recommendation_returns_the_short_depth(client: TestClient) -> None:
    _use_weather(_weather(first_forecast_et0=2.0))
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "REDUCE"
    assert body["recommended_depth_mm"] == pytest.approx(12.0)
    assert body["recommended_minutes"] == 72
    assert body["suggested_change_minutes"] == -18
    assert body["why"]["forecast_et0_mm"] == pytest.approx(2.0)
    assert body["why"]["estimated_crop_demand_mm"] == pytest.approx(2.0)
    assert body["why"]["projected_depletions_mm"] == pytest.approx([12.0] * 7)
    assert body["why"]["projected_max_depletion_mm"] == pytest.approx(12.0)
    assert "less than a normal" in body["reason"]


def test_water_recommendation_returns_a_full_event(client: TestClient) -> None:
    _use_weather(_weather(first_forecast_et0=6.0))
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "WATER"
    assert body["recommended_depth_mm"] == pytest.approx(16.0)
    assert body["recommended_minutes"] == 96
    assert body["suggested_change_minutes"] == 6
    assert body["why"]["forecast_et0_mm"] == pytest.approx(6.0)
    assert body["why"]["estimated_crop_demand_mm"] == pytest.approx(6.0)
    assert body["why"]["projected_depletions_mm"] == pytest.approx([16.0] * 7)
    assert body["why"]["projected_max_depletion_mm"] == pytest.approx(16.0)
    assert "at least a normal" in body["reason"]


def test_weather_unavailable_returns_cannot_recommend(client: TestClient) -> None:
    def failing_weather(latitude: float, longitude: float) -> list[WeatherDay]:
        raise WeatherUnavailableError("Open-Meteo could not be reached.")

    app.dependency_overrides[get_weather_client] = lambda: failing_weather
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 503
    assert response.json() == {
        "state": "CANNOT_RECOMMEND",
        "code": "weather_unavailable",
        "reason": "Open-Meteo could not be reached.",
        "message": "Open-Meteo could not be reached.",
    }

    with TestingSessionLocal() as session:
        assert session.execute(select(Recommendation)).scalars().all() == []


def test_missing_constants_returns_cannot_recommend_without_fetching_weather(
    client: TestClient,
) -> None:
    called: list[tuple[float, float]] = []

    def recording_weather(latitude: float, longitude: float) -> list[WeatherDay]:
        called.append((latitude, longitude))
        return _weather()

    app.dependency_overrides[get_weather_client] = lambda: recording_weather
    app.dependency_overrides[get_constants_resolver] = lambda: lambda profile: None
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 503
    body = response.json()
    assert body["state"] == "CANNOT_RECOMMEND"
    assert body["code"] == "constants_unavailable"
    assert "constants are not configured" in body["reason"]
    assert called == []


def test_insufficient_forecast_days_returns_cannot_recommend(client: TestClient) -> None:
    _use_weather(_weather()[:13])
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 503
    body = response.json()
    assert body["state"] == "CANNOT_RECOMMEND"
    assert body["code"] == "insufficient_forecast"
    assert "Only 6 forecast days" in body["reason"]


def test_last_watering_outside_the_weather_window_returns_cannot_recommend(
    client: TestClient,
) -> None:
    _use_weather(_weather())
    profile = _create(client, last_watered_date="2025-12-01")

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 503
    body = response.json()
    assert body["state"] == "CANNOT_RECOMMEND"
    assert body["code"] == "last_watering_out_of_range"
    assert "not in the available weather history" in body["reason"]


def test_last_watering_today_uses_todays_weather(client: TestClient) -> None:
    _use_weather(_weather(first_forecast_et0=2.0))
    profile = _create(
        client,
        last_watered_date="2026-01-08",
        events_per_week=3,
    )

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 200
    body = response.json()
    assert body["inputs"]["observed"] == [
        {
            "date": "2026-01-08",
            "et0_mm": 2.0,
            "precipitation_mm": 0.0,
            "basis": "today_forecast",
        }
    ]
    assert body["inputs"]["forecast"][0]["date"] == "2026-01-09"
    assert body["freshness"]["forecast_start"] == "2026-01-08"


def test_stale_weather_returns_cannot_recommend(client: TestClient) -> None:
    _use_weather(_weather())
    app.dependency_overrides[get_now] = lambda: datetime(2026, 2, 1, tzinfo=UTC)
    profile = _create(client)

    response = client.get(f"/profiles/{profile['id']}/recommendation")

    assert response.status_code == 503
    body = response.json()
    assert body["state"] == "CANNOT_RECOMMEND"
    assert body["code"] == "stale_weather_data"
    assert "2026-01-08" in body["reason"]


def test_unknown_profile_returns_404_without_fetching_weather(client: TestClient) -> None:
    response = client.get("/profiles/does-not-exist/recommendation")

    assert response.status_code == 404
    assert response.json() == {
        "code": "profile_not_found",
        "message": "No profile exists for that ID.",
    }
