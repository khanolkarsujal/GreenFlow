"""Profile request/response schemas and routes."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorResponse
from app.db import profiles as profile_store
from app.db.database import get_db

router = APIRouter(prefix="/profiles", tags=["profiles"])

SessionDep = Annotated[Session, Depends(get_db)]


class ProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location_label: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    lawn_area_m2: float = Field(gt=0, allow_inf_nan=False)
    grass_type: str = Field(min_length=1, max_length=80)
    soil_type: str = Field(min_length=1, max_length=80)
    sprinkler_type: str = Field(min_length=1, max_length=80)
    precipitation_rate_mm_per_hour: float = Field(gt=0, allow_inf_nan=False)
    baseline_minutes_per_event: int = Field(gt=0)
    events_per_week: int = Field(gt=0)
    last_watered_date: date
    last_watered_minutes: int = Field(gt=0)


class ProfileCreate(ProfileFields):
    pass


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location_label: str | None = Field(default=None, min_length=1, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    lawn_area_m2: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    grass_type: str | None = Field(default=None, min_length=1, max_length=80)
    soil_type: str | None = Field(default=None, min_length=1, max_length=80)
    sprinkler_type: str | None = Field(default=None, min_length=1, max_length=80)
    precipitation_rate_mm_per_hour: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    baseline_minutes_per_event: int | None = Field(default=None, gt=0)
    events_per_week: int | None = Field(default=None, gt=0)
    last_watered_date: date | None = None
    last_watered_minutes: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _require_non_null_changes(self) -> ProfileUpdate:
        if not self.model_fields_set:
            raise ValueError("provide at least one field to update")
        null_fields = sorted(name for name in self.model_fields_set if getattr(self, name) is None)
        if null_fields:
            raise ValueError(f"fields cannot be null: {', '.join(null_fields)}")
        return self


class ProfileResponse(ProfileFields):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: str
    is_demo: bool


@router.post(
    "",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def create_profile(payload: ProfileCreate, session: SessionDep) -> ProfileResponse:
    profile = profile_store.create_profile(
        session,
        location_label=payload.location_label,
        latitude=payload.latitude,
        longitude=payload.longitude,
        lawn_area_m2=payload.lawn_area_m2,
        grass_type=payload.grass_type,
        soil_type=payload.soil_type,
        sprinkler_type=payload.sprinkler_type,
        precipitation_rate_mm_per_hour=payload.precipitation_rate_mm_per_hour,
        baseline_minutes_per_event=payload.baseline_minutes_per_event,
        events_per_week=payload.events_per_week,
        last_watered_date=payload.last_watered_date,
        last_watered_minutes=payload.last_watered_minutes,
    )
    return ProfileResponse.model_validate(profile)


@router.get(
    "/{profile_id}",
    response_model=ProfileResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_profile(profile_id: str, session: SessionDep) -> ProfileResponse:
    profile = profile_store.get_profile(session, profile_id)
    if profile is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "profile_not_found",
            "No profile exists for that ID.",
        )
    return ProfileResponse.model_validate(profile)


@router.patch(
    "/{profile_id}",
    response_model=ProfileResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_profile(
    profile_id: str,
    payload: ProfileUpdate,
    session: SessionDep,
) -> ProfileResponse:
    profile = profile_store.update_profile(
        session,
        profile_id,
        location_label=payload.location_label,
        latitude=payload.latitude,
        longitude=payload.longitude,
        lawn_area_m2=payload.lawn_area_m2,
        grass_type=payload.grass_type,
        soil_type=payload.soil_type,
        sprinkler_type=payload.sprinkler_type,
        precipitation_rate_mm_per_hour=payload.precipitation_rate_mm_per_hour,
        baseline_minutes_per_event=payload.baseline_minutes_per_event,
        events_per_week=payload.events_per_week,
        last_watered_date=payload.last_watered_date,
        last_watered_minutes=payload.last_watered_minutes,
    )
    if profile is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "profile_not_found",
            "No profile exists for that ID.",
        )
    return ProfileResponse.model_validate(profile)
