"""Recommendation route: load a profile, call the service, return the result."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.clock import get_now
from app.api.errors import ApiError, ErrorResponse
from app.db import profiles as profile_store
from app.db import recommendations as recommendation_store
from app.db.database import get_db
from app.engine import volumes
from app.engine.constants import ConstantsUnavailable
from app.services import recommendation as recommendation_service
from app.services.open_meteo import fetch_daily_weather
from app.services.recommendation import ConstantsResolver, WeatherClient

router = APIRouter(prefix="/profiles", tags=["recommendations"])
snapshot_router = APIRouter(prefix="/recommendations", tags=["recommendations"])

SessionDep = Annotated[Session, Depends(get_db)]


def get_weather_client() -> WeatherClient:
    return fetch_daily_weather


def get_constants_resolver() -> ConstantsResolver:
    return recommendation_service.resolve_irrigation_constants


WeatherClientDep = Annotated[WeatherClient, Depends(get_weather_client)]
ConstantsResolverDep = Annotated[ConstantsResolver, Depends(get_constants_resolver)]
NowDep = Annotated[datetime, Depends(get_now)]


class WhyNumbers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    initial_depletion_mm: float
    observed_rainfall_mm: float
    forecast_rainfall_mm: float
    forecast_et0_mm: float
    estimated_crop_demand_mm: float
    taw_mm: float
    raw_mm: float
    skip_threshold_mm: float
    horizon_days: int
    projected_depletions_mm: list[float]
    projected_max_depletion_mm: float
    baseline_event_mm: float
    irrigation_efficiency: float


class DurationNumbers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommended_minutes: int
    baseline_minutes: int
    suggested_change_minutes: int
    depth_mm: float
    precipitation_rate_mm_per_hour: float
    irrigation_efficiency: float
    formula: str
    efficiency_note: str


class WeatherInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    et0_mm: float
    precipitation_mm: float
    basis: Literal["observed", "forecast", "today_forecast"]


class WeatherInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observed: list[WeatherInput]
    forecast: list[WeatherInput]


class Freshness(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["live", "cached"]
    provider: str
    retrieved_at: datetime
    observed_start: date
    observed_end: date
    forecast_start: date
    forecast_end: date
    forecast_days_available: int
    horizon_days: int
    note: str


class SourceRefResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    citation: str
    url: str | None


class FactorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    value: str
    role: Literal["applied", "context"]
    detail: str
    source_id: str | None


class RecommendationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    profile_id: str
    created_at: datetime
    state: Literal["SKIP", "REDUCE", "WATER"]
    recommended_depth_mm: float
    recommended_minutes: int
    baseline_minutes: int
    suggested_change_minutes: int
    reason: str
    why: WhyNumbers
    duration: DurationNumbers
    inputs: WeatherInputs
    freshness: Freshness
    sources: list[SourceRefResponse]
    factors: list[FactorResponse]
    uncertainty: str
    limitations: list[str]
    assumptions: list[str]
    lawn_area_m2: float
    precipitation_rate_mm_per_hour: float
    baseline_water_litres: float
    recommended_water_litres: float
    avoided_water_litres: float


class CannotRecommendResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: Literal["CANNOT_RECOMMEND"] = "CANNOT_RECOMMEND"
    code: str
    reason: str
    message: str


def _cannot_recommend(outcome: recommendation_service.CannotRecommend) -> JSONResponse:
    body = CannotRecommendResponse(
        code=outcome.code,
        reason=outcome.reason,
        message=outcome.reason,
    )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=body.model_dump(),
    )


@router.get(
    "/{profile_id}/recommendation",
    response_model=RecommendationResponse,
    responses={
        404: {"model": ErrorResponse},
        503: {"model": CannotRecommendResponse},
    },
)
def get_recommendation(
    profile_id: str,
    session: SessionDep,
    weather_client: WeatherClientDep,
    constants_resolver: ConstantsResolverDep,
    now: NowDep,
) -> RecommendationResponse | JSONResponse:
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
        return _cannot_recommend(
            recommendation_service.CannotRecommend(
                code="constants_unavailable",
                reason=str(exc),
            )
        )

    outcome = recommendation_service.recommend_for_profile(
        session,
        profile=profile,
        weather_client=weather_client,
        constants=constants,
        created_at=now,
    )
    if isinstance(outcome, recommendation_service.CannotRecommend):
        return _cannot_recommend(outcome)

    response = _response_for(outcome)
    recommendation_store.set_response_snapshot(
        session,
        recommendation_id=outcome.id,
        snapshot=response.model_dump(mode="json"),
    )
    return response


def _response_for(
    outcome: recommendation_service.StoredRecommendation,
) -> RecommendationResponse:
    """Render one recommendation into the single canonical response body.

    Every screen reads volumes from here; they come from the depths and
    the area snapshotted at generation time, never from rounded minutes.
    """
    event_volumes = volumes.event_volumes(
        baseline_depth_mm=outcome.baseline_event_mm,
        recommended_depth_mm=outcome.recommended_depth_mm,
        lawn_area_m2=outcome.lawn_area_m2,
    )
    return RecommendationResponse(
        id=outcome.id,
        profile_id=outcome.profile_id,
        created_at=outcome.created_at,
        state=outcome.state.value,
        recommended_depth_mm=outcome.recommended_depth_mm,
        recommended_minutes=outcome.recommended_minutes,
        baseline_minutes=outcome.baseline_minutes,
        suggested_change_minutes=outcome.suggested_change_minutes,
        reason=outcome.reason,
        why=WhyNumbers(
            initial_depletion_mm=outcome.initial_depletion_mm,
            observed_rainfall_mm=outcome.observed_rainfall_mm,
            forecast_rainfall_mm=outcome.forecast_rainfall_mm,
            forecast_et0_mm=outcome.forecast_et0_mm,
            estimated_crop_demand_mm=outcome.estimated_crop_demand_mm,
            taw_mm=outcome.taw_mm,
            raw_mm=outcome.raw_mm,
            skip_threshold_mm=outcome.skip_threshold_mm,
            horizon_days=outcome.horizon_days,
            projected_depletions_mm=list(outcome.projected_depletions_mm),
            projected_max_depletion_mm=outcome.projected_max_depletion_mm,
            baseline_event_mm=outcome.baseline_event_mm,
            irrigation_efficiency=outcome.irrigation_efficiency,
        ),
        duration=DurationNumbers(
            recommended_minutes=outcome.recommended_minutes,
            baseline_minutes=outcome.baseline_minutes,
            suggested_change_minutes=outcome.suggested_change_minutes,
            depth_mm=outcome.recommended_depth_mm,
            precipitation_rate_mm_per_hour=outcome.precipitation_rate_mm_per_hour,
            irrigation_efficiency=outcome.irrigation_efficiency,
            formula=recommendation_service.DURATION_FORMULA,
            efficiency_note=recommendation_service.EFFICIENCY_NOTE,
        ),
        inputs=WeatherInputs(
            observed=[WeatherInput.model_validate(item) for item in outcome.observed_inputs],
            forecast=[WeatherInput.model_validate(item) for item in outcome.forecast_inputs],
        ),
        freshness=Freshness(
            mode=outcome.freshness.mode,
            provider=outcome.freshness.provider,
            retrieved_at=outcome.freshness.retrieved_at,
            observed_start=outcome.freshness.observed_start,
            observed_end=outcome.freshness.observed_end,
            forecast_start=outcome.freshness.forecast_start,
            forecast_end=outcome.freshness.forecast_end,
            forecast_days_available=outcome.freshness.forecast_days_available,
            horizon_days=outcome.freshness.horizon_days,
            note=outcome.freshness.note,
        ),
        sources=[
            SourceRefResponse(
                id=source.id,
                label=source.label,
                citation=source.citation,
                url=source.url,
            )
            for source in outcome.sources
        ],
        factors=[
            FactorResponse(
                id=factor.id,
                label=factor.label,
                value=factor.value,
                role=factor.role,
                detail=factor.detail,
                source_id=factor.source_id,
            )
            for factor in outcome.factors
        ],
        uncertainty=outcome.uncertainty,
        limitations=list(outcome.limitations),
        assumptions=list(outcome.assumptions),
        lawn_area_m2=outcome.lawn_area_m2,
        precipitation_rate_mm_per_hour=outcome.precipitation_rate_mm_per_hour,
        baseline_water_litres=event_volumes.baseline_water_litres,
        recommended_water_litres=event_volumes.recommended_water_litres,
        avoided_water_litres=event_volumes.avoided_water_litres,
    )


@snapshot_router.get(
    "/{recommendation_id}",
    response_model=RecommendationResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def get_stored_recommendation(
    recommendation_id: str,
    session: SessionDep,
) -> RecommendationResponse:
    """Return the exact body the server produced for this recommendation.

    Nothing is recalculated: the stored response is replayed so every
    screen shows the numbers the user was originally given.
    """
    row = recommendation_store.get_recommendation(session, recommendation_id)
    if row is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "recommendation_not_found",
            "No recommendation exists for that ID.",
        )

    snapshot = row.response_snapshot
    if not isinstance(snapshot, dict):
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "recommendation_snapshot_missing",
            "This recommendation predates response snapshots, so its original "
            "figures cannot be replayed. Generate a new recommendation.",
        )

    return RecommendationResponse.model_validate(snapshot)
