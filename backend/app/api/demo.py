"""Demo account routes: load the fixed demo lawn, or clear the rows it seeded.

Both actions touch demo-tagged rows only. A real profile is never read,
written, or counted by anything in this module.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.backtest import get_history_client
from app.api.clock import get_now
from app.api.errors import ApiError, ErrorResponse
from app.api.profiles import ProfileResponse
from app.api.recommendations import ConstantsResolverDep
from app.db import profiles as profile_store
from app.db.database import get_db
from app.db.models import Profile
from app.engine.constants import ConstantsUnavailable
from app.services import demo as demo_service
from app.services.backtest import HistoryClient

router = APIRouter(prefix="/demo", tags=["demo"])

SessionDep = Annotated[Session, Depends(get_db)]
NowDep = Annotated[datetime, Depends(get_now)]

HistoryClientDep = Annotated[HistoryClient, Depends(get_history_client)]

DEMO_TAG = "Demo data"
DEMO_LOAD_NOTE = (
    "Demo account: 30 days replayed from real weather, assuming every "
    "recommendation was followed. Estimate, not measured."
)
DEMO_RESET_NOTE = (
    "Demo rows removed. The demo lawn profile itself is kept, and no row "
    "belonging to a real profile was touched."
)


class DemoAccountResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["demo_account"] = "demo_account"
    tag: str
    note: str
    generated_at: datetime
    profile: ProfileResponse
    events_written: int
    replay_days: int
    start_date: date
    end_date: date
    scheduled_events: int
    skip_events: int
    reduce_events: int
    water_events: int
    estimated_baseline_litres: float
    estimated_recommended_litres: float
    estimated_water_avoided_litres: float
    estimated_avoided_percent: float
    assumptions: list[str]


class DemoResetResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["demo_account"] = "demo_account"
    tag: str
    note: str
    profile_id: str
    feedback_deleted: int
    recommendations_deleted: int


class CannotLoadDemoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["demo_account"] = "demo_account"
    state: Literal["CANNOT_LOAD_DEMO"] = "CANNOT_LOAD_DEMO"
    code: str
    reason: str
    message: str


def _cannot_load(code: str, reason: str) -> JSONResponse:
    body = CannotLoadDemoResponse(code=code, reason=reason, message=reason)
    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=body.model_dump())


def _profile_response(profile: Profile) -> ProfileResponse:
    return ProfileResponse.model_validate(profile)


@router.post(
    "/account",
    response_model=DemoAccountResponse,
    responses={404: {"model": ErrorResponse}, 503: {"model": CannotLoadDemoResponse}},
)
def load_demo_account(
    session: SessionDep,
    history_client: HistoryClientDep,
    constants_resolver: ConstantsResolverDep,
    now: NowDep,
) -> DemoAccountResponse | JSONResponse:
    profile = demo_service.ensure_demo_profile(session, today=now.date())

    try:
        constants = constants_resolver(profile)
    except ConstantsUnavailable as exc:
        return _cannot_load("constants_unavailable", str(exc))

    outcome = demo_service.load_demo_account(
        session,
        profile=profile,
        history_client=history_client,
        constants=constants,
        now=now,
    )
    if isinstance(outcome, demo_service.CannotLoadDemo):
        return _cannot_load(outcome.code, outcome.reason)

    replay = outcome.replay
    return DemoAccountResponse(
        tag=DEMO_TAG,
        note=DEMO_LOAD_NOTE,
        generated_at=now,
        profile=_profile_response(outcome.profile),
        events_written=outcome.events_written,
        replay_days=outcome.replay_days,
        start_date=replay.start_date,
        end_date=replay.end_date,
        scheduled_events=replay.scheduled_events,
        skip_events=replay.skip_events,
        reduce_events=replay.reduce_events,
        water_events=replay.water_events,
        estimated_baseline_litres=replay.baseline_volume_l,
        estimated_recommended_litres=replay.recommended_volume_l,
        estimated_water_avoided_litres=replay.avoided_volume_l,
        estimated_avoided_percent=replay.avoided_percent,
        assumptions=[demo_service.DEMO_ROW_ASSUMPTION, *replay.assumptions],
    )


@router.post(
    "/account/reset",
    response_model=DemoResetResponse,
    responses={404: {"model": ErrorResponse}},
)
def reset_demo_account(
    session: SessionDep,
) -> DemoResetResponse:
    profile = profile_store.get_profile(session, demo_service.DEMO_PROFILE_ID)
    if profile is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "profile_not_found",
            "No profile exists for that ID.",
        )

    outcome = demo_service.reset_demo_account(session, profile_id=profile.id)
    return DemoResetResponse(
        tag=DEMO_TAG,
        note=DEMO_RESET_NOTE,
        profile_id=outcome.profile_id,
        feedback_deleted=outcome.feedback_deleted,
        recommendations_deleted=outcome.recommendations_deleted,
    )
