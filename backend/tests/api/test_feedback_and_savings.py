"""Confirmation and estimated-savings routes, including duplicate prevention."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.clock import get_now
from app.api.recommendations import get_constants_resolver, get_weather_client
from app.db.database import Base, get_db
from app.db.models import RecommendationFeedback
from app.main import app
from app.services.open_meteo import WeatherDay
from tests.api.test_recommendations import TEST_CONSTANTS, _payload, _weather

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, expire_on_commit=False)
NOW = datetime(2026, 1, 8, 7, 0, tzinfo=UTC)


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

    def _weather_days(latitude: float, longitude: float) -> list[WeatherDay]:
        return _weather(first_forecast_et0=2.0)

    app.dependency_overrides[get_db] = _get_test_db
    app.dependency_overrides[get_weather_client] = lambda: _weather_days
    app.dependency_overrides[get_constants_resolver] = lambda: lambda profile: TEST_CONSTANTS
    app.dependency_overrides[get_now] = lambda: NOW
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _create_profile(client: TestClient) -> dict[str, Any]:
    response = client.post("/profiles", json=_payload())
    assert response.status_code == 201
    return response.json()


def _create_recommendation(client: TestClient, profile_id: str) -> dict[str, Any]:
    response = client.get(f"/profiles/{profile_id}/recommendation")
    assert response.status_code == 200
    return response.json()


def test_confirmation_records_one_row_and_updates_savings(client: TestClient) -> None:
    profile = _create_profile(client)
    recommendation = _create_recommendation(client, profile["id"])
    assert recommendation["state"] == "REDUCE"
    assert recommendation["recommended_minutes"] == 72

    response = client.post(
        f"/recommendations/{recommendation['id']}/feedback",
        json={"followed": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["followed"] is True
    assert body["already_confirmed"] is False
    assert body["avoided_minutes"] == pytest.approx(18.0)
    assert body["estimated_water_avoided_litres"] == pytest.approx(360.0)
    assert body["confirmed_at"] == "2026-01-08T07:00:00Z"

    duplicate = client.post(
        f"/recommendations/{recommendation['id']}/feedback",
        json={"followed": True},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["already_confirmed"] is True
    assert duplicate.json()["confirmed_at"] == body["confirmed_at"]

    with TestingSessionLocal() as session:
        rows = session.execute(select(RecommendationFeedback)).scalars().all()
    assert len(rows) == 1

    savings = client.get(f"/profiles/{profile['id']}/savings?window_days=30")
    assert savings.status_code == 200
    summary = savings.json()
    assert summary["confirmed_count"] == 1
    assert summary["followed_count"] == 1
    assert summary["not_followed_count"] == 0
    assert summary["pending_count"] == 0
    assert summary["estimated_baseline_litres"] == pytest.approx(1800.0)
    assert summary["estimated_recommended_litres"] == pytest.approx(1440.0)
    assert summary["estimated_water_avoided_litres"] == pytest.approx(360.0)
    assert summary["estimated_avoided_percent"] == pytest.approx(20.0)
    assert summary["events"][0]["recommendation_id"] == recommendation["id"]
    assert summary["events"][0]["state"] == "REDUCE"
    assert summary["events"][0]["followed"] is True
    assert any("not a measured water saving" in item for item in summary["assumptions"])


def test_not_followed_records_the_action_without_avoided_water(
    client: TestClient,
) -> None:
    profile = _create_profile(client)
    recommendation = _create_recommendation(client, profile["id"])

    response = client.post(
        f"/recommendations/{recommendation['id']}/feedback",
        json={"followed": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["followed"] is False
    assert body["avoided_minutes"] == pytest.approx(0.0)
    assert body["estimated_water_avoided_litres"] == pytest.approx(0.0)

    summary = client.get(f"/profiles/{profile['id']}/savings").json()
    assert summary["confirmed_count"] == 1
    assert summary["followed_count"] == 0
    assert summary["not_followed_count"] == 1
    assert summary["estimated_water_avoided_litres"] == pytest.approx(0.0)
    assert summary["estimated_recommended_litres"] == pytest.approx(1800.0)


def test_unconfirmed_recommendation_stays_pending(client: TestClient) -> None:
    profile = _create_profile(client)
    recommendation = _create_recommendation(client, profile["id"])

    summary = client.get(f"/profiles/{profile['id']}/savings").json()

    assert summary["confirmed_count"] == 0
    assert summary["pending_count"] == 1
    assert summary["estimated_water_avoided_litres"] == pytest.approx(0.0)
    assert summary["pending"][0]["recommendation_id"] == recommendation["id"]


def test_feedback_for_unknown_recommendation_is_404(client: TestClient) -> None:
    response = client.post(
        "/recommendations/does-not-exist/feedback",
        json={"followed": True},
    )

    assert response.status_code == 404
    assert response.json() == {
        "code": "recommendation_not_found",
        "message": "No recommendation exists for that ID.",
    }


def test_savings_for_unknown_profile_is_404(client: TestClient) -> None:
    response = client.get("/profiles/does-not-exist/savings")

    assert response.status_code == 404
    assert response.json() == {
        "code": "profile_not_found",
        "message": "No profile exists for that ID.",
    }


def test_savings_window_excludes_older_confirmations(client: TestClient) -> None:
    profile = _create_profile(client)
    recommendation = _create_recommendation(client, profile["id"])
    client.post(
        f"/recommendations/{recommendation['id']}/feedback",
        json={"followed": True},
    )

    with TestingSessionLocal() as session:
        row = session.execute(select(RecommendationFeedback)).scalar_one()
        row.confirmed_at = NOW - timedelta(days=5)
        session.commit()

    summary = client.get(f"/profiles/{profile['id']}/savings?window_days=1").json()

    assert summary["confirmed_count"] == 0
    assert summary["estimated_water_avoided_litres"] == pytest.approx(0.0)
