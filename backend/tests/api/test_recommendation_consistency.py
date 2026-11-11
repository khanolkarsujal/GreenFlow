"""One recommendation must produce one set of numbers on every screen.

These tests lock the contract the dashboard, the explanation page, the
confirmation step, and the savings page all read from: the volumes come
from the server, from the depths stored with the recommendation, and a
recommendation never changes after it has been shown.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.clock import get_now
from app.api.recommendations import get_constants_resolver, get_weather_client
from app.db.database import Base, get_db
from app.db.models import Recommendation
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

AREA_M2 = 120.0


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
    response = client.post("/profiles", json=_payload(lawn_area_m2=AREA_M2))
    assert response.status_code == 201
    return response.json()


def _generate(client: TestClient, profile_id: str) -> dict[str, Any]:
    response = client.get(f"/profiles/{profile_id}/recommendation")
    assert response.status_code == 200
    return response.json()


def _stored_row(recommendation_id: str) -> Recommendation:
    with TestingSessionLocal() as session:
        return session.execute(
            select(Recommendation).where(Recommendation.id == recommendation_id)
        ).scalar_one()


def test_response_carries_volumes_that_reconcile_with_the_depths(client: TestClient) -> None:
    profile = _create_profile(client)

    body = _generate(client, profile["id"])

    assert body["lawn_area_m2"] == pytest.approx(AREA_M2)
    assert body["precipitation_rate_mm_per_hour"] == pytest.approx(10.0)
    assert body["baseline_water_litres"] == pytest.approx(body["why"]["baseline_event_mm"] * AREA_M2)
    assert body["recommended_water_litres"] == pytest.approx(
        body["recommended_depth_mm"] * AREA_M2
    )
    assert body["avoided_water_litres"] == pytest.approx(
        body["baseline_water_litres"] - body["recommended_water_litres"]
    )
    assert body["recommended_minutes"] == round(body["recommended_depth_mm"] / 10.0 * 60)


def test_by_id_route_replays_the_generated_body_verbatim(client: TestClient) -> None:
    profile = _create_profile(client)
    generated = _generate(client, profile["id"])

    replayed = client.get(f"/recommendations/{generated['id']}")

    assert replayed.status_code == 200
    assert replayed.json() == generated
    assert _stored_row(generated["id"]).response_snapshot == generated


def test_a_recommendation_is_not_recalculated_when_the_profile_is_edited(
    client: TestClient,
) -> None:
    profile = _create_profile(client)
    first = _generate(client, profile["id"])

    patched = client.patch(f"/profiles/{profile['id']}", json={"lawn_area_m2": 240.0})
    assert patched.status_code == 200
    second = _generate(client, profile["id"])

    assert second["id"] != first["id"]
    assert second["lawn_area_m2"] == pytest.approx(240.0)
    assert second["baseline_water_litres"] == pytest.approx(first["baseline_water_litres"] * 2.0)

    replayed = client.get(f"/recommendations/{first['id']}")
    assert replayed.json() == first
    assert replayed.json()["lawn_area_m2"] == pytest.approx(AREA_M2)


def test_savings_and_the_recommendation_report_the_same_volumes(client: TestClient) -> None:
    profile = _create_profile(client)
    recommendation = _generate(client, profile["id"])

    confirmed = client.post(
        f"/recommendations/{recommendation['id']}/feedback",
        json={"followed": True},
    )
    assert confirmed.status_code == 200
    savings = client.get(f"/profiles/{profile['id']}/savings?window_days=7")
    assert savings.status_code == 200

    event = savings.json()["events"][0]
    assert event["recommendation_id"] == recommendation["id"]
    assert event["estimated_baseline_litres"] == pytest.approx(
        recommendation["baseline_water_litres"]
    )
    assert event["estimated_recommended_litres"] == pytest.approx(
        recommendation["recommended_water_litres"]
    )
    assert event["estimated_water_avoided_litres"] == pytest.approx(
        recommendation["avoided_water_litres"]
    )
    totals = savings.json()
    assert totals["estimated_baseline_litres"] - totals["estimated_recommended_litres"] == (
        pytest.approx(totals["estimated_water_avoided_litres"])
    )
    assert confirmed.json()["estimated_water_avoided_litres"] == pytest.approx(
        recommendation["avoided_water_litres"]
    )


def test_a_not_followed_confirmation_counts_the_baseline_as_applied(
    client: TestClient,
) -> None:
    profile = _create_profile(client)
    recommendation = _generate(client, profile["id"])

    client.post(f"/recommendations/{recommendation['id']}/feedback", json={"followed": False})
    totals = client.get(f"/profiles/{profile['id']}/savings?window_days=7").json()

    assert totals["estimated_water_avoided_litres"] == pytest.approx(0.0)
    assert totals["estimated_recommended_litres"] == pytest.approx(
        totals["estimated_baseline_litres"]
    )


def test_by_id_route_refuses_to_invent_a_missing_snapshot(client: TestClient) -> None:
    profile = _create_profile(client)
    recommendation = _generate(client, profile["id"])

    with TestingSessionLocal() as session:
        row = session.get(Recommendation, recommendation["id"])
        assert row is not None
        row.response_snapshot = None
        session.commit()

    response = client.get(f"/recommendations/{recommendation['id']}")

    assert response.status_code == 409
    assert response.json()["code"] == "recommendation_snapshot_missing"


def test_by_id_route_returns_not_found_for_an_unknown_id(client: TestClient) -> None:
    response = client.get("/recommendations/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json()["code"] == "recommendation_not_found"
