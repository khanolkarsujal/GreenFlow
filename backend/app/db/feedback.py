"""Writes and reads for user confirmation of recommendations."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import RecommendationFeedback


def get_feedback(session: Session, recommendation_id: str) -> RecommendationFeedback | None:
    return session.execute(
        select(RecommendationFeedback).where(
            RecommendationFeedback.recommendation_id == recommendation_id
        )
    ).scalar_one_or_none()


def create_feedback(
    session: Session,
    *,
    recommendation_id: str,
    profile_id: str,
    followed: bool,
    recommended_minutes: float,
    baseline_minutes: float,
    recommended_depth_mm: float,
    baseline_event_mm: float,
    precipitation_rate_mm_per_hour: float,
    lawn_area_m2: float,
    confirmed_at: datetime,
    is_demo: bool = False,
) -> RecommendationFeedback:
    feedback = RecommendationFeedback(
        id=str(uuid4()),
        recommendation_id=recommendation_id,
        profile_id=profile_id,
        followed=followed,
        recommended_minutes=recommended_minutes,
        baseline_minutes=baseline_minutes,
        recommended_depth_mm=recommended_depth_mm,
        baseline_event_mm=baseline_event_mm,
        precipitation_rate_mm_per_hour=precipitation_rate_mm_per_hour,
        lawn_area_m2=lawn_area_m2,
        confirmed_at=confirmed_at,
        is_demo=is_demo,
    )
    session.add(feedback)
    session.commit()
    session.refresh(feedback)
    return feedback


def list_feedback(
    session: Session,
    *,
    profile_id: str,
    since: datetime,
    include_demo: bool = False,
) -> list[RecommendationFeedback]:
    """Rows for one profile. Demo rows are hidden unless the profile is the demo one."""
    statement = select(RecommendationFeedback).where(
        RecommendationFeedback.profile_id == profile_id,
        RecommendationFeedback.confirmed_at >= since,
    )
    if not include_demo:
        statement = statement.where(RecommendationFeedback.is_demo.is_(False))

    return list(
        session.execute(statement.order_by(RecommendationFeedback.confirmed_at.desc()))
        .scalars()
        .all()
    )


def delete_demo_feedback(session: Session, *, profile_id: str) -> int:
    """Remove every demo-tagged confirmation for one profile and return the count."""
    result = session.execute(
        delete(RecommendationFeedback).where(
            RecommendationFeedback.profile_id == profile_id,
            RecommendationFeedback.is_demo.is_(True),
        )
    )
    session.commit()
    return int(result.rowcount or 0)
