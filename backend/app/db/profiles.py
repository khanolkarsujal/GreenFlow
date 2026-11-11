"""Queries for property profiles. The only module that writes profiles."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import Profile


def create_profile(
    session: Session,
    *,
    location_label: str,
    latitude: float,
    longitude: float,
    lawn_area_m2: float,
    grass_type: str,
    soil_type: str,
    sprinkler_type: str,
    precipitation_rate_mm_per_hour: float,
    baseline_minutes_per_event: int,
    events_per_week: int,
    last_watered_date: date,
    last_watered_minutes: int,
    profile_id: str | None = None,
    is_demo: bool = False,
) -> Profile:
    profile = Profile(
        id=profile_id or str(uuid4()),
        location_label=location_label,
        latitude=latitude,
        longitude=longitude,
        lawn_area_m2=lawn_area_m2,
        grass_type=grass_type,
        soil_type=soil_type,
        sprinkler_type=sprinkler_type,
        precipitation_rate_mm_per_hour=precipitation_rate_mm_per_hour,
        baseline_minutes_per_event=baseline_minutes_per_event,
        events_per_week=events_per_week,
        last_watered_date=last_watered_date,
        last_watered_minutes=last_watered_minutes,
        is_demo=is_demo,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def get_profile(session: Session, profile_id: str) -> Profile | None:
    return session.get(Profile, profile_id)


def update_profile(
    session: Session,
    profile_id: str,
    *,
    location_label: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    lawn_area_m2: float | None = None,
    grass_type: str | None = None,
    soil_type: str | None = None,
    sprinkler_type: str | None = None,
    precipitation_rate_mm_per_hour: float | None = None,
    baseline_minutes_per_event: int | None = None,
    events_per_week: int | None = None,
    last_watered_date: date | None = None,
    last_watered_minutes: int | None = None,
) -> Profile | None:
    profile = session.get(Profile, profile_id)
    if profile is None:
        return None

    changes = (
        ("location_label", location_label),
        ("latitude", latitude),
        ("longitude", longitude),
        ("lawn_area_m2", lawn_area_m2),
        ("grass_type", grass_type),
        ("soil_type", soil_type),
        ("sprinkler_type", sprinkler_type),
        ("precipitation_rate_mm_per_hour", precipitation_rate_mm_per_hour),
        ("baseline_minutes_per_event", baseline_minutes_per_event),
        ("events_per_week", events_per_week),
        ("last_watered_date", last_watered_date),
        ("last_watered_minutes", last_watered_minutes),
    )
    for field_name, value in changes:
        if value is not None:
            setattr(profile, field_name, value)

    session.commit()
    session.refresh(profile)
    return profile
