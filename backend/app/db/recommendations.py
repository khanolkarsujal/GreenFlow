"""Writes for stored recommendations."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import Recommendation


def create_recommendation(
    session: Session,
    *,
    profile_id: str,
    created_at: datetime,
    state: str,
    recommended_depth_mm: float,
    recommended_minutes: float,
    baseline_minutes: int,
    retrieved_at: datetime,
    weather_mode: str,
    reason: str,
    uncertainty: str,
    taw_mm: float,
    raw_mm: float,
    skip_threshold_mm: float,
    horizon_days: int,
    projected_depletions_mm: list[float],
    projected_max_depletion_mm: float,
    baseline_event_mm: float,
    irrigation_efficiency: float,
    config: dict[str, object],
    forecast_inputs: list[dict[str, object]],
    observed_inputs: list[dict[str, object]],
    profile_inputs: dict[str, object],
    assumptions: list[str],
    limitations: list[str],
    sources: list[dict[str, object]],
    is_demo: bool = False,
) -> Recommendation:
    recommendation = Recommendation(
        id=str(uuid4()),
        profile_id=profile_id,
        created_at=created_at,
        state=state,
        recommended_depth_mm=recommended_depth_mm,
        recommended_minutes=recommended_minutes,
        baseline_minutes=baseline_minutes,
        retrieved_at=retrieved_at,
        weather_mode=weather_mode,
        reason=reason,
        uncertainty=uncertainty,
        taw_mm=taw_mm,
        raw_mm=raw_mm,
        skip_threshold_mm=skip_threshold_mm,
        horizon_days=horizon_days,
        projected_depletions_mm=projected_depletions_mm,
        projected_max_depletion_mm=projected_max_depletion_mm,
        baseline_event_mm=baseline_event_mm,
        irrigation_efficiency=irrigation_efficiency,
        config=config,
        forecast_inputs=forecast_inputs,
        observed_inputs=observed_inputs,
        profile_inputs=profile_inputs,
        assumptions=assumptions,
        limitations=limitations,
        sources=sources,
        is_demo=is_demo,
    )
    session.add(recommendation)
    session.commit()
    session.refresh(recommendation)
    return recommendation


def get_recommendation(session: Session, recommendation_id: str) -> Recommendation | None:
    return session.get(Recommendation, recommendation_id)


def set_response_snapshot(
    session: Session,
    *,
    recommendation_id: str,
    snapshot: dict[str, object],
) -> None:
    """Store the exact response body for one recommendation.

    Every screen reads this record instead of re-deriving advice, so the
    stored bytes are the single source of truth for a recommendation's
    numbers.
    """
    row = session.get(Recommendation, recommendation_id)
    if row is None:
        return

    row.response_snapshot = snapshot
    session.commit()


def list_recommendations(
    session: Session,
    *,
    profile_id: str,
    since: datetime,
    include_demo: bool = False,
) -> list[Recommendation]:
    """Rows for one profile. Demo rows are hidden unless the profile is the demo one."""
    statement = select(Recommendation).where(
        Recommendation.profile_id == profile_id,
        Recommendation.created_at >= since,
    )
    if not include_demo:
        statement = statement.where(Recommendation.is_demo.is_(False))

    return list(
        session.execute(statement.order_by(Recommendation.created_at.desc())).scalars().all()
    )


def delete_demo_recommendations(session: Session, *, profile_id: str) -> int:
    """Remove every demo-tagged recommendation for one profile and return the count."""
    result = session.execute(
        delete(Recommendation).where(
            Recommendation.profile_id == profile_id,
            Recommendation.is_demo.is_(True),
        )
    )
    session.commit()
    return int(result.rowcount or 0)
