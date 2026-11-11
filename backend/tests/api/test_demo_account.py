"""Demo account routes: seeded history, isolation from real profiles, reset.

The expected numbers are never typed in here. Each one is read back from
the replay endpoint or derived from it, so the test proves the rows carry
the engine's own figures rather than a hand-picked total.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.backtest import get_history_client
from app.api.clock import get_now
from app.api.recommendations import get_constants_resolver, get_weather_client
from app.db import feedback as feedback_store
from app.db import recommendations as recommendation_store
from app.db.database import Base, get_db
from app.db.models import Recommendation, RecommendationFeedback
from app.engine.constants import ConstantsUnavailable
from app.engine.models import IrrigationConstants
from app.main import app
from app.services.demo import DEMO_PROFILE_ID
from app.services.open_meteo import WeatherDay, WeatherUnavailableError

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, expire_on_commit=False)

NOW = datetime(2026, 2, 1, 7, 0, tzinfo=UTC)
WINDOW_START = date(2026, 1, 2)
WINDOW_DAYS = 30

# Test-only constants: TAW = (0.30 - 0.10) * 0.20 * 1000 = 40 mm,
# RAW = 0.5 * 40 = 20 mm, skip threshold = 0.5 * 20 = 10 mm.
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


def _fake_history(latitude: float, longitude: float) -> list[WeatherDay]:
    return _history()


def _fake_weather(latitude: float, longitude: float) -> list[WeatherDay]:
    """Seven observed days ending yesterday and seven forecast days from today."""
    return [
        WeatherDay(
            date=NOW.date() + timedelta(days=offset - 7),
            precipitation_mm=0.0,
            temp_max_c=20.0,
            temp_min_c=10.0,
            wind_max_ms=1.0,
            et0_mm=2.0 if offset >= 7 else 0.0,
            is_forecast=offset >= 7,
        )
        for offset in range(14)
    ]


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
    app.dependency_overrides[get_history_client] = lambda: _fake_history
    app.dependency_overrides[get_weather_client] = lambda: _fake_weather
    app.dependency_overrides[get_constants_resolver] = lambda: lambda profile: TEST_CONSTANTS
    app.dependency_overrides[get_now] = lambda: NOW
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _real_profile(client: TestClient, **overrides: object) -> dict[str, Any]:
    payload: dict[str, object] = {
        "location_label": "Real back yard",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "lawn_area_m2": 90.0,
        "grass_type": "Kentucky bluegrass",
        "soil_type": "loamy",
        "sprinkler_type": "rotor",
        "precipitation_rate_mm_per_hour": 12.0,
        "baseline_minutes_per_event": 45,
        "events_per_week": 2,
        "last_watered_date": (NOW - timedelta(days=2)).date().isoformat(),
        "last_watered_minutes": 45,
    }
    payload.update(overrides)
    response = client.post("/profiles", json=payload)
    assert response.status_code == 201
    return response.json()


def _load_demo(client: TestClient) -> dict[str, Any]:
    response = client.post("/demo/account")
    assert response.status_code == 200
    return response.json()


def _rows() -> tuple[list[Recommendation], list[RecommendationFeedback]]:
    with TestingSessionLocal() as session:
        recommendations = list(session.execute(select(Recommendation)).scalars().all())
        feedback_rows = list(session.execute(select(RecommendationFeedback)).scalars().all())
    return recommendations, feedback_rows


def test_load_creates_the_flagged_demo_profile_and_seeds_history(client: TestClient) -> None:
    body = _load_demo(client)

    assert body["mode"] == "demo_account"
    assert body["tag"] == "Demo data"
    assert body["note"] == (
        "Demo account: 30 days replayed from real weather, assuming every "
        "recommendation was followed. Estimate, not measured."
    )
    assert body["profile"]["id"] == DEMO_PROFILE_ID
    assert body["profile"]["is_demo"] is True

    stored = client.get(f"/profiles/{DEMO_PROFILE_ID}")
    assert stored.status_code == 200
    assert stored.json()["is_demo"] is True

    recommendations, feedback_rows = _rows()
    assert len(recommendations) == body["events_written"]
    assert len(feedback_rows) == body["events_written"]
    assert all(row.is_demo for row in recommendations)
    assert all(row.is_demo for row in feedback_rows)
    assert all(row.followed for row in feedback_rows)
    assert all(row.profile_id == DEMO_PROFILE_ID for row in feedback_rows)


def test_seeded_rows_reproduce_the_replay_totals_exactly(client: TestClient) -> None:
    loaded = _load_demo(client)

    backtest = client.get(f"/profiles/{DEMO_PROFILE_ID}/backtest")
    assert backtest.status_code == 200
    replay = backtest.json()

    assert loaded["events_written"] == replay["scheduled_events"]
    assert loaded["estimated_water_avoided_litres"] == pytest.approx(
        replay["estimated_water_avoided_litres"]
    )

    savings = client.get(f"/profiles/{DEMO_PROFILE_ID}/savings?window_days=30").json()
    assert savings["is_demo"] is True
    assert savings["confirmed_count"] == loaded["events_written"]
    assert savings["followed_count"] == loaded["events_written"]
    assert savings["estimated_water_avoided_litres"] == pytest.approx(
        replay["estimated_water_avoided_litres"]
    )
    assert savings["estimated_baseline_litres"] == pytest.approx(
        replay["estimated_baseline_litres"]
    )
    assert savings["estimated_recommended_litres"] == pytest.approx(
        replay["estimated_recommended_litres"]
    )


def test_savings_report_averages_over_the_window(client: TestClient) -> None:
    _load_demo(client)

    for window_days in (7, 30, 90):
        savings = client.get(f"/profiles/{DEMO_PROFILE_ID}/savings?window_days={window_days}").json()
        total = savings["estimated_water_avoided_litres"]
        assert savings["average_avoided_litres_per_day"] == pytest.approx(total / window_days)
        assert savings["average_avoided_litres_per_week"] == pytest.approx(total / (window_days / 7))

    savings = client.get(f"/profiles/{DEMO_PROFILE_ID}/savings?window_days=30").json()
    assert savings["average_avoided_litres_per_day"] > 0
    assert any("per day and per week" in text for text in savings["assumptions"])


def test_demo_rows_never_reach_a_real_profile(client: TestClient) -> None:
    _load_demo(client)
    real = _real_profile(client)

    recommendations, feedback_rows = _rows()
    demo_ids = {row.id for row in recommendations if row.is_demo}

    savings = client.get(f"/profiles/{real['id']}/savings?window_days=30").json()
    assert savings["is_demo"] is False
    assert savings["confirmed_count"] == 0
    assert savings["followed_count"] == 0
    assert savings["pending_count"] == 0
    assert savings["estimated_water_avoided_litres"] == pytest.approx(0.0)
    assert savings["average_avoided_litres_per_day"] == pytest.approx(0.0)
    assert not demo_ids & {event["recommendation_id"] for event in savings["events"]}
    assert not demo_ids & {row.profile_id for row in feedback_rows if row.profile_id == real["id"]}


def test_a_demo_tagged_row_is_hidden_from_a_real_profile_even_when_misfiled(
    client: TestClient,
) -> None:
    """The guard is the is_demo flag, not only the profile_id it happens to carry."""
    real = _real_profile(client)

    with TestingSessionLocal() as session:
        recommendation = recommendation_store.create_recommendation(
            session,
            profile_id=real["id"],
            created_at=NOW,
            state="SKIP",
            recommended_depth_mm=0.0,
            recommended_minutes=0.0,
            baseline_minutes=45,
            retrieved_at=NOW,
            weather_mode="observed_history",
            reason="test row",
            uncertainty="test row",
            taw_mm=40.0,
            raw_mm=20.0,
            skip_threshold_mm=10.0,
            horizon_days=0,
            projected_depletions_mm=[],
            projected_max_depletion_mm=0.0,
            baseline_event_mm=9.0,
            irrigation_efficiency=1.0,
            config={},
            forecast_inputs=[],
            observed_inputs=[],
            profile_inputs={},
            assumptions=[],
            limitations=[],
            sources=[],
            is_demo=True,
        )
        feedback_store.create_feedback(
            session,
            recommendation_id=recommendation.id,
            profile_id=real["id"],
            followed=True,
            recommended_minutes=0.0,
            baseline_minutes=45.0,
            recommended_depth_mm=0.0,
            baseline_event_mm=9.0,
            precipitation_rate_mm_per_hour=12.0,
            lawn_area_m2=90.0,
            confirmed_at=NOW,
            is_demo=True,
        )

    savings = client.get(f"/profiles/{real['id']}/savings?window_days=30").json()
    assert savings["confirmed_count"] == 0
    assert savings["pending_count"] == 0
    assert savings["estimated_water_avoided_litres"] == pytest.approx(0.0)


def test_loading_twice_does_not_double_count(client: TestClient) -> None:
    first = _load_demo(client)
    second = _load_demo(client)

    assert second["events_written"] == first["events_written"]
    assert second["estimated_water_avoided_litres"] == pytest.approx(
        first["estimated_water_avoided_litres"]
    )

    recommendations, feedback_rows = _rows()
    assert len(recommendations) == first["events_written"]
    assert len(feedback_rows) == first["events_written"]

    savings = client.get(f"/profiles/{DEMO_PROFILE_ID}/savings?window_days=30").json()
    assert savings["confirmed_count"] == first["events_written"]


def test_reset_removes_demo_rows_and_leaves_real_rows(client: TestClient) -> None:
    _load_demo(client)
    real = _real_profile(client)

    response = client.get(f"/profiles/{real['id']}/recommendation")
    assert response.status_code == 200
    real_recommendation = response.json()
    client.post(
        f"/recommendations/{real_recommendation['id']}/feedback",
        json={"followed": True},
    )

    before = client.get(f"/profiles/{real['id']}/savings?window_days=30").json()
    assert before["confirmed_count"] == 1

    reset = client.post("/demo/account/reset")
    assert reset.status_code == 200
    body = reset.json()
    assert body["recommendations_deleted"] > 0
    assert body["feedback_deleted"] > 0

    recommendations, feedback_rows = _rows()
    assert not any(row.is_demo for row in recommendations)
    assert not any(row.is_demo for row in feedback_rows)

    demo_savings = client.get(f"/profiles/{DEMO_PROFILE_ID}/savings?window_days=30").json()
    assert demo_savings["confirmed_count"] == 0
    assert demo_savings["estimated_water_avoided_litres"] == pytest.approx(0.0)

    real_savings = client.get(f"/profiles/{real['id']}/savings?window_days=30").json()
    assert real_savings["confirmed_count"] == 1
    assert real_savings["estimated_water_avoided_litres"] == pytest.approx(
        before["estimated_water_avoided_litres"]
    )


def test_reset_is_safe_when_nothing_was_loaded(client: TestClient) -> None:
    _load_demo(client)
    client.post("/demo/account/reset")

    again = client.post("/demo/account/reset")
    assert again.status_code == 200
    assert again.json()["feedback_deleted"] == 0
    assert again.json()["recommendations_deleted"] == 0


def test_load_reports_the_replay_failure_without_writing_rows(client: TestClient) -> None:

    def unavailable(latitude: float, longitude: float) -> list[WeatherDay]:
        raise WeatherUnavailableError("Open-Meteo could not be reached.")

    app.dependency_overrides[get_history_client] = lambda: unavailable

    response = client.post("/demo/account")
    assert response.status_code == 503
    body = response.json()
    assert body["state"] == "CANNOT_LOAD_DEMO"
    assert body["code"] == "weather_unavailable"

    recommendations, feedback_rows = _rows()
    assert recommendations == []
    assert feedback_rows == []


def test_load_reports_missing_constants_without_writing_rows(client: TestClient) -> None:
    def unavailable_constants(profile: Any) -> IrrigationConstants:
        raise ConstantsUnavailable("No cited constant set exists for this profile.")

    app.dependency_overrides[get_constants_resolver] = lambda: unavailable_constants

    response = client.post("/demo/account")
    assert response.status_code == 503
    assert response.json()["code"] == "constants_unavailable"

    recommendations, feedback_rows = _rows()
    assert recommendations == []
