"""Estimated water avoided, built only from confirmed recommendations."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.clock import as_utc, get_now
from app.api.errors import ApiError, ErrorResponse
from app.db import feedback as feedback_store
from app.db import profiles as profile_store
from app.db import recommendations as recommendation_store
from app.db.database import get_db
from app.engine import volumes

router = APIRouter(prefix="/profiles", tags=["savings"])

SessionDep = Annotated[Session, Depends(get_db)]
NowDep = Annotated[datetime, Depends(get_now)]

SAVINGS_ASSUMPTIONS: tuple[str, ...] = (
    "Only recommendations you confirmed are counted; unconfirmed recommendations are pending.",
    "Estimated water avoided = (baseline depth − recommended depth) × lawn area, "
    "using the depths stored with the recommendation.",
    "Volumes assume 1 mm of water over 1 m² equals 1 L.",
    "This is an estimate from your reported baseline and sprinkler rate, "
    "not a measured water saving.",
    "No flow meter, water bill, or soil-moisture sensor is used.",
    "Average avoided per day and per week divide the confirmed total by the "
    "requested window, so they describe that window rather than any single week.",
)


class SavingsEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommendation_id: str
    state: str
    followed: bool
    baseline_minutes: float
    recommended_minutes: float
    avoided_minutes: float
    baseline_depth_mm: float
    recommended_depth_mm: float
    estimated_baseline_litres: float
    estimated_recommended_litres: float
    estimated_water_avoided_litres: float
    confirmed_at: datetime


class PendingRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommendation_id: str
    state: str
    recommended_minutes: int
    baseline_minutes: int
    created_at: datetime


class SavingsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_id: str
    is_demo: bool
    window_days: int
    generated_at: datetime
    confirmed_count: int
    followed_count: int
    not_followed_count: int
    pending_count: int
    estimated_baseline_litres: float
    estimated_recommended_litres: float
    estimated_water_avoided_litres: float
    estimated_avoided_percent: float
    average_avoided_litres_per_day: float
    average_avoided_litres_per_week: float
    events: list[SavingsEvent]
    pending: list[PendingRecommendation]
    assumptions: list[str]


def _volume_litres(*, depth_mm: float, lawn_area_m2: float) -> float:
    return volumes.litres_for_depth(depth_mm=depth_mm, lawn_area_m2=lawn_area_m2)


@router.get(
    "/{profile_id}/savings",
    response_model=SavingsResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_savings(
    profile_id: str,
    session: SessionDep,
    now: NowDep,
    window_days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> SavingsResponse:
    profile = profile_store.get_profile(session, profile_id)
    if profile is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "profile_not_found",
            "No profile exists for that ID.",
        )

    since = now - timedelta(days=window_days)
    feedback_rows = feedback_store.list_feedback(
        session,
        profile_id=profile_id,
        since=since,
        include_demo=profile.is_demo,
    )
    recommendations = recommendation_store.list_recommendations(
        session,
        profile_id=profile_id,
        since=since,
        include_demo=profile.is_demo,
    )
    by_id = {row.id: row for row in recommendations}
    confirmed_ids = {row.recommendation_id for row in feedback_rows}

    events: list[SavingsEvent] = []
    baseline_litres = 0.0
    recommended_litres = 0.0
    avoided_litres = 0.0
    followed_count = 0

    for row in feedback_rows:
        recommendation = by_id.get(row.recommendation_id)
        state = recommendation.state if recommendation is not None else "UNKNOWN"
        event_baseline = _volume_litres(
            depth_mm=row.baseline_event_mm,
            lawn_area_m2=row.lawn_area_m2,
        )
        event_recommended = _volume_litres(
            depth_mm=row.recommended_depth_mm,
            lawn_area_m2=row.lawn_area_m2,
        )
        event_avoided = max(0.0, event_baseline - event_recommended) if row.followed else 0.0
        if row.followed:
            followed_count += 1

        baseline_litres += event_baseline
        avoided_litres += event_avoided
        recommended_litres += event_recommended if row.followed else event_baseline
        events.append(
            SavingsEvent(
                recommendation_id=row.recommendation_id,
                state=state,
                followed=row.followed,
                baseline_minutes=row.baseline_minutes,
                recommended_minutes=row.recommended_minutes,
                avoided_minutes=(
                    max(0.0, row.baseline_minutes - row.recommended_minutes)
                    if row.followed
                    else 0.0
                ),
                baseline_depth_mm=row.baseline_event_mm,
                recommended_depth_mm=row.recommended_depth_mm,
                estimated_baseline_litres=event_baseline,
                estimated_recommended_litres=event_recommended,
                estimated_water_avoided_litres=event_avoided,
                confirmed_at=as_utc(row.confirmed_at),
            )
        )

    pending = [
        PendingRecommendation(
            recommendation_id=row.id,
            state=row.state,
            recommended_minutes=int(row.recommended_minutes or 0),
            baseline_minutes=int(row.baseline_minutes or 0),
            created_at=as_utc(row.created_at),
        )
        for row in recommendations
        if row.id not in confirmed_ids
    ]

    avoided_percent = avoided_litres / baseline_litres * 100.0 if baseline_litres > 0 else 0.0
    weeks_in_window = window_days / 7.0

    return SavingsResponse(
        profile_id=profile_id,
        is_demo=profile.is_demo,
        window_days=window_days,
        generated_at=now,
        confirmed_count=len(feedback_rows),
        followed_count=followed_count,
        not_followed_count=len(feedback_rows) - followed_count,
        pending_count=len(pending),
        estimated_baseline_litres=baseline_litres,
        estimated_recommended_litres=recommended_litres,
        estimated_water_avoided_litres=avoided_litres,
        estimated_avoided_percent=avoided_percent,
        average_avoided_litres_per_day=avoided_litres / window_days,
        average_avoided_litres_per_week=avoided_litres / weeks_in_window,
        events=events,
        pending=pending,
        assumptions=list(SAVINGS_ASSUMPTIONS),
    )
