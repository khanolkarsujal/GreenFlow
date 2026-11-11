"""Run saved profiles through the real service/engine against live weather.

Uses an in-memory database so no rows are added to the demo SQLite file.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base
from app.db.models import Profile
from app.services.open_meteo import fetch_daily_weather
from app.services.recommendation import (
    CannotRecommend,
    recommend_for_profile,
    resolve_irrigation_constants,
)

SOURCE = "lawn_advisor.db"
PROFILE_IDS = [
    "be036506-29ca-4a91-8cd6-2957cfd72493",
    "7fe28a61-c9a9-498f-ae3f-19659dfe5126",
    "cf363adb-58b2-4e62-9e90-d506a75bbc95",
]

source = sqlite3.connect(SOURCE)
source.row_factory = sqlite3.Row

engine = create_engine("sqlite://")
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base.metadata.create_all(bind=engine)

with SessionLocal() as session:
    for profile_id in PROFILE_IDS:
        row = source.execute(
            "select * from profiles where id = ?", (profile_id,)
        ).fetchone()
        if row is None:
            print(f"{profile_id}: missing")
            continue
        profile = Profile(
            id=row["id"],
            location_label=row["location_label"],
            latitude=row["latitude"],
            longitude=row["longitude"],
            lawn_area_m2=row["lawn_area_m2"],
            grass_type=row["grass_type"],
            soil_type=row["soil_type"],
            sprinkler_type=row["sprinkler_type"],
            precipitation_rate_mm_per_hour=row["precipitation_rate_mm_per_hour"],
            baseline_minutes_per_event=row["baseline_minutes_per_event"],
            events_per_week=row["events_per_week"],
            last_watered_date=date.fromisoformat(row["last_watered_date"]),
            last_watered_minutes=row["last_watered_minutes"],
        )
        session.add(profile)
        session.commit()

        constants = resolve_irrigation_constants(profile)
        outcome = recommend_for_profile(
            session,
            profile=profile,
            weather_client=fetch_daily_weather,
            constants=constants,
            created_at=datetime.now(UTC),
        )
        if isinstance(outcome, CannotRecommend):
            print(f"{profile.location_label}: CANNOT_RECOMMEND {outcome.code} - {outcome.reason}")
            continue

        print(
            {
                "profile": profile.location_label,
                "profile_id": profile.id,
                "state": outcome.state.value,
                "recommended_minutes": outcome.recommended_minutes,
                "baseline_minutes": outcome.baseline_minutes,
                "suggested_change_minutes": outcome.suggested_change_minutes,
                "recommended_depth_mm": round(outcome.recommended_depth_mm, 2),
                "baseline_event_mm": round(outcome.baseline_event_mm, 2),
                "initial_depletion_mm": round(outcome.initial_depletion_mm, 2),
                "observed_rainfall_mm": round(outcome.observed_rainfall_mm, 2),
                "forecast_rainfall_mm": round(outcome.forecast_rainfall_mm, 2),
                "forecast_et0_mm": round(outcome.forecast_et0_mm, 2),
                "projected_depletions_mm": [round(v, 2) for v in outcome.projected_depletions_mm],
                "skip_threshold_mm": round(outcome.skip_threshold_mm, 2),
                "horizon_days": outcome.horizon_days,
                "retrieved_at": outcome.freshness.retrieved_at.isoformat(),
            }
        )
