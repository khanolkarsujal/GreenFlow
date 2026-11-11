"""Profile route tests against an in-memory SQLite database."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, expire_on_commit=False)


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
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "location_label": "Test back yard",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "lawn_area_m2": 120.0,
        "grass_type": "test grass",
        "soil_type": "test soil",
        "sprinkler_type": "test sprinkler",
        "precipitation_rate_mm_per_hour": 12.5,
        "baseline_minutes_per_event": 20,
        "events_per_week": 3,
        "last_watered_date": "2026-11-02",
        "last_watered_minutes": 20,
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, **overrides: object) -> dict[str, Any]:
    response = client.post("/profiles", json=_payload(**overrides))
    assert response.status_code == 201
    return response.json()


def test_create_profile_returns_generated_profile(client: TestClient) -> None:
    body = _create(client)

    assert isinstance(body["id"], str)
    assert len(body["id"]) == 36
    assert body["location_label"] == "Test back yard"
    assert body["latitude"] == pytest.approx(37.7749)
    assert body["longitude"] == pytest.approx(-122.4194)
    assert body["lawn_area_m2"] == pytest.approx(120.0)
    assert body["grass_type"] == "test grass"
    assert body["soil_type"] == "test soil"
    assert body["sprinkler_type"] == "test sprinkler"
    assert body["precipitation_rate_mm_per_hour"] == pytest.approx(12.5)
    assert body["baseline_minutes_per_event"] == 20
    assert body["events_per_week"] == 3
    assert body["last_watered_date"] == "2026-11-02"
    assert body["last_watered_minutes"] == 20


def test_create_rejects_a_client_supplied_id(client: TestClient) -> None:
    response = client.post("/profiles", json=_payload(id="client-chosen"))

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid_request"
    assert set(body) == {"code", "message"}
    assert "id" in body["message"]


def test_get_profile_returns_the_presented_profile(client: TestClient) -> None:
    created = _create(client)

    response = client.get(f"/profiles/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_unknown_profile_returns_404_error_structure(client: TestClient) -> None:
    response = client.get("/profiles/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "code": "profile_not_found",
        "message": "No profile exists for that ID.",
    }


def test_update_changes_only_provided_fields(client: TestClient) -> None:
    created = _create(client)

    response = client.patch(
        f"/profiles/{created['id']}",
        json={"lawn_area_m2": 80.5, "events_per_week": 2},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == created["id"]
    assert updated["lawn_area_m2"] == pytest.approx(80.5)
    assert updated["events_per_week"] == 2
    assert updated["grass_type"] == created["grass_type"]
    assert updated["location_label"] == created["location_label"]
    assert updated["last_watered_date"] == created["last_watered_date"]

    stored = client.get(f"/profiles/{created['id']}").json()
    assert stored == updated


def test_update_unknown_profile_returns_404(client: TestClient) -> None:
    response = client.patch("/profiles/does-not-exist", json={"lawn_area_m2": 80.0})

    assert response.status_code == 404
    assert response.json()["code"] == "profile_not_found"


def test_update_with_empty_body_returns_400(client: TestClient) -> None:
    created = _create(client)

    response = client.patch(f"/profiles/{created['id']}", json={})

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid_request"
    assert set(body) == {"code", "message"}
    assert "at least one field" in body["message"].lower()


def test_update_rejects_a_null_field(client: TestClient) -> None:
    created = _create(client)

    response = client.patch(f"/profiles/{created['id']}", json={"lawn_area_m2": None})

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid_request"
    assert "null" in body["message"].lower()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("lawn_area_m2", 0),
        ("latitude", 91),
        ("longitude", -181),
        ("events_per_week", 0),
        ("precipitation_rate_mm_per_hour", 0),
        ("last_watered_minutes", 0),
    ],
)
def test_invalid_create_input_returns_400(client: TestClient, field: str, value: object) -> None:
    response = client.post("/profiles", json=_payload(**{field: value}))

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid_request"
    assert set(body) == {"code", "message"}
    assert field in body["message"]


def test_update_only_touches_the_profile_in_the_path(client: TestClient) -> None:
    first = _create(client, location_label="First lawn")
    second = _create(client, location_label="Second lawn")

    response = client.patch(
        f"/profiles/{first['id']}",
        json={"lawn_area_m2": 45.0},
    )
    assert response.status_code == 200

    unchanged = client.get(f"/profiles/{second['id']}").json()
    assert unchanged["lawn_area_m2"] == pytest.approx(120.0)
    assert unchanged["location_label"] == "Second lawn"

    changed = client.get(f"/profiles/{first['id']}").json()
    assert changed["lawn_area_m2"] == pytest.approx(45.0)


def test_update_cannot_reassign_the_profile_id(client: TestClient) -> None:
    first = _create(client, location_label="First lawn")
    second = _create(client, location_label="Second lawn")

    response = client.patch(
        f"/profiles/{second['id']}",
        json={"id": first["id"], "lawn_area_m2": 10.0},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"

    unchanged = client.get(f"/profiles/{second['id']}").json()
    assert unchanged["id"] == second["id"]
    assert unchanged["lawn_area_m2"] == pytest.approx(120.0)


def test_unknown_route_uses_the_error_structure(client: TestClient) -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "not_found"
    assert set(body) == {"code", "message"}
