"""Backtest route: replay the last 30 days of observed weather for a profile."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.clock import get_now
from app.api.errors import ApiError, ErrorResponse
from app.api.recommendations import ConstantsResolverDep
from app.db import profiles as profile_store
from app.db.database import get_db
from app.engine.constants import ConstantsUnavailable
from app.services import backtest as backtest_service
from app.services.open_meteo import fetch_daily_history

router = APIRouter(prefix="/profiles", tags=["backtest"])

SessionDep = Annotated[Session, Depends(get_db)]
NowDep = Annotated[datetime, Depends(get_now)]


def get_history_client() -> backtest_service.HistoryClient:
    return fetch_daily_history


HistoryClientDep = Annotated[backtest_service.HistoryClient, Depends(get_history_client)]


class BacktestStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    scheduled: bool
    state: Literal["SKIP", "REDUCE", "WATER"] | None
    depletion_start_mm: float
    baseline_applied_mm: float
    recommended_applied_mm: float
    depletion_end_mm: float


class BacktestInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lawn_area_m2: float
    precipitation_rate_mm_per_hour: float
    baseline_minutes_per_event: int
    baseline_event_mm: float
    events_per_week: int
    irrigation_efficiency: float
    taw_mm: float
    raw_mm: float
    skip_threshold_mm: float
    total_et0_mm: float
    total_rainfall_mm: float


class SourceRefResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    citation: str
    url: str | None


class BacktestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_id: str
    mode: Literal["simulated_backtest"] = "simulated_backtest"
    tag: str
    generated_at: datetime
    window_days: int
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
    inputs: BacktestInputs
    steps: list[BacktestStep]
    assumptions: list[str]
    limitations: list[str]
    sources: list[SourceRefResponse]


class CannotBacktestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["simulated_backtest"] = "simulated_backtest"
    state: Literal["CANNOT_BACKTEST"] = "CANNOT_BACKTEST"
    code: str
    reason: str
    message: str


def _cannot_backtest(outcome: backtest_service.CannotBacktest) -> JSONResponse:
    body = CannotBacktestResponse(
        code=outcome.code,
        reason=outcome.reason,
        message=outcome.reason,
    )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=body.model_dump(),
    )


@router.get(
    "/{profile_id}/backtest",
    response_model=BacktestResponse,
    responses={
        404: {"model": ErrorResponse},
        503: {"model": CannotBacktestResponse},
    },
)
def get_backtest(
    profile_id: str,
    session: SessionDep,
    history_client: HistoryClientDep,
    constants_resolver: ConstantsResolverDep,
    now: NowDep,
) -> BacktestResponse | JSONResponse:
    profile = profile_store.get_profile(session, profile_id)
    if profile is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "profile_not_found",
            "No profile exists for that ID.",
        )

    try:
        constants = constants_resolver(profile)
    except ConstantsUnavailable as exc:
        return _cannot_backtest(
            backtest_service.CannotBacktest(code="constants_unavailable", reason=str(exc))
        )

    outcome = backtest_service.backtest_for_profile(
        profile=profile,
        history_client=history_client,
        constants=constants,
        generated_at=now,
    )
    if isinstance(outcome, backtest_service.CannotBacktest):
        return _cannot_backtest(outcome)

    return BacktestResponse(
        profile_id=outcome.profile_id,
        tag=outcome.tag,
        generated_at=outcome.generated_at,
        window_days=outcome.window_days,
        start_date=outcome.start_date,
        end_date=outcome.end_date,
        scheduled_events=outcome.scheduled_events,
        skip_events=outcome.skip_events,
        reduce_events=outcome.reduce_events,
        water_events=outcome.water_events,
        estimated_baseline_litres=outcome.baseline_volume_l,
        estimated_recommended_litres=outcome.recommended_volume_l,
        estimated_water_avoided_litres=outcome.avoided_volume_l,
        estimated_avoided_percent=outcome.avoided_percent,
        inputs=BacktestInputs(
            lawn_area_m2=outcome.lawn_area_m2,
            precipitation_rate_mm_per_hour=outcome.precipitation_rate_mm_per_hour,
            baseline_minutes_per_event=outcome.baseline_minutes_per_event,
            baseline_event_mm=outcome.baseline_event_mm,
            events_per_week=outcome.events_per_week,
            irrigation_efficiency=outcome.irrigation_efficiency,
            taw_mm=outcome.taw_mm,
            raw_mm=outcome.raw_mm,
            skip_threshold_mm=outcome.skip_threshold_mm,
            total_et0_mm=outcome.total_et0_mm,
            total_rainfall_mm=outcome.total_rainfall_mm,
        ),
        steps=[
            BacktestStep(
                date=step.date,
                scheduled=step.scheduled,
                state=step.state,
                depletion_start_mm=step.depletion_start_mm,
                baseline_applied_mm=step.baseline_applied_mm,
                recommended_applied_mm=step.recommended_applied_mm,
                depletion_end_mm=step.depletion_end_mm,
            )
            for step in outcome.steps
        ],
        assumptions=list(outcome.assumptions),
        limitations=list(outcome.limitations),
        sources=[
            SourceRefResponse(
                id=source.id,
                label=source.label,
                citation=source.citation,
                url=source.url,
            )
            for source in outcome.sources
        ],
    )
