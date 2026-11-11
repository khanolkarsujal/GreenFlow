"""User confirmation for a recommendation.

A confirmation is stored once per recommendation. Repeating the
same request returns the stored row instead of creating a second
one, so savings are never double counted.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.clock import as_utc, get_now
from app.api.errors import ApiError, ErrorResponse
from app.db import feedback as feedback_store
from app.db import recommendations as recommendation_store
from app.db.database import get_db
from app.engine import volumes

router = APIRouter(prefix="/recommendations", tags=["feedback"])

SessionDep = Annotated[Session, Depends(get_db)]
NowDep = Annotated[datetime, Depends(get_now)]


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    followed: bool


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommendation_id: str
    profile_id: str
    state: str
    followed: bool
    recommended_minutes: float
    baseline_minutes: float
    avoided_minutes: float
    estimated_water_avoided_litres: float
    confirmed_at: datetime
    already_confirmed: bool


def _avoided_litres(
    *,
    followed: bool,
    baseline_depth_mm: float,
    recommended_depth_mm: float,
    lawn_area_m2: float,
) -> float:
    """Volume avoided, derived from the stored depths — never from rounded minutes."""
    if not followed:
        return 0.0
    return volumes.event_volumes(
        baseline_depth_mm=baseline_depth_mm,
        recommended_depth_mm=recommended_depth_mm,
        lawn_area_m2=lawn_area_m2,
    ).avoided_water_litres


@router.post(
    "/{recommendation_id}/feedback",
    response_model=FeedbackResponse,
    responses={404: {"model": ErrorResponse}},
)
def confirm_recommendation(
    recommendation_id: str,
    payload: FeedbackRequest,
    session: SessionDep,
    now: NowDep,
) -> FeedbackResponse:
    recommendation = recommendation_store.get_recommendation(session, recommendation_id)
    if recommendation is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "recommendation_not_found",
            "No recommendation exists for that ID.",
        )

    existing = feedback_store.get_feedback(session, recommendation_id)
    if existing is not None:
        return FeedbackResponse(
            recommendation_id=existing.recommendation_id,
            profile_id=existing.profile_id,
            state=recommendation.state,
            followed=existing.followed,
            recommended_minutes=existing.recommended_minutes,
            baseline_minutes=existing.baseline_minutes,
            avoided_minutes=max(
                0.0,
                existing.baseline_minutes - existing.recommended_minutes,
            )
            if existing.followed
            else 0.0,
            estimated_water_avoided_litres=_avoided_litres(
                followed=existing.followed,
                baseline_depth_mm=existing.baseline_event_mm,
                recommended_depth_mm=existing.recommended_depth_mm,
                lawn_area_m2=existing.lawn_area_m2,
            ),
            confirmed_at=as_utc(existing.confirmed_at),
            already_confirmed=True,
        )

    recommended_minutes = float(recommendation.recommended_minutes or 0.0)
    baseline_minutes = float(
        recommendation.baseline_minutes
        or recommendation.profile_inputs.get("baseline_minutes_per_event", 0)
    )
    precipitation_rate = float(
        recommendation.profile_inputs.get("precipitation_rate_mm_per_hour", 0.0)
    )
    lawn_area_m2 = float(recommendation.profile_inputs.get("lawn_area_m2", 0.0))
    if precipitation_rate <= 0 or lawn_area_m2 <= 0:
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "savings_basis_unavailable",
            "This recommendation has no stored precipitation rate or lawn area, "
            "so water savings cannot be estimated.",
        )

    created = feedback_store.create_feedback(
        session,
        recommendation_id=recommendation.id,
        profile_id=recommendation.profile_id,
        followed=payload.followed,
        recommended_minutes=recommended_minutes,
        baseline_minutes=baseline_minutes,
        recommended_depth_mm=recommendation.recommended_depth_mm,
        baseline_event_mm=recommendation.baseline_event_mm,
        precipitation_rate_mm_per_hour=precipitation_rate,
        lawn_area_m2=lawn_area_m2,
        confirmed_at=now,
    )

    return FeedbackResponse(
        recommendation_id=created.recommendation_id,
        profile_id=created.profile_id,
        state=recommendation.state,
        followed=created.followed,
        recommended_minutes=created.recommended_minutes,
        baseline_minutes=created.baseline_minutes,
        avoided_minutes=max(0.0, created.baseline_minutes - created.recommended_minutes)
        if created.followed
        else 0.0,
        estimated_water_avoided_litres=_avoided_litres(
            followed=created.followed,
            baseline_depth_mm=created.baseline_event_mm,
            recommended_depth_mm=created.recommended_depth_mm,
            lawn_area_m2=created.lawn_area_m2,
        ),
        confirmed_at=as_utc(created.confirmed_at),
        already_confirmed=False,
    )
