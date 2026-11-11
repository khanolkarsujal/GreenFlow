"""SQLAlchemy tables for the advisor."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    location_label: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    lawn_area_m2: Mapped[float] = mapped_column(Float)
    grass_type: Mapped[str] = mapped_column(String(80))
    soil_type: Mapped[str] = mapped_column(String(80))
    sprinkler_type: Mapped[str] = mapped_column(String(80))
    precipitation_rate_mm_per_hour: Mapped[float] = mapped_column(Float)
    baseline_minutes_per_event: Mapped[int] = mapped_column(Integer)
    events_per_week: Mapped[int] = mapped_column(Integer)
    last_watered_date: Mapped[date] = mapped_column(Date)
    last_watered_minutes: Mapped[int] = mapped_column(Integer)
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0", default=False
    )


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(16))
    recommended_depth_mm: Mapped[float] = mapped_column(Float)
    recommended_minutes: Mapped[float | None] = mapped_column(Float)
    baseline_minutes: Mapped[int | None] = mapped_column(Integer)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    weather_mode: Mapped[str | None] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(Text)
    uncertainty: Mapped[str] = mapped_column(Text)
    taw_mm: Mapped[float] = mapped_column(Float)
    raw_mm: Mapped[float] = mapped_column(Float)
    skip_threshold_mm: Mapped[float] = mapped_column(Float)
    horizon_days: Mapped[int] = mapped_column(Integer)
    projected_depletions_mm: Mapped[list[float]] = mapped_column(JSON)
    projected_max_depletion_mm: Mapped[float] = mapped_column(Float)
    baseline_event_mm: Mapped[float] = mapped_column(Float)
    irrigation_efficiency: Mapped[float] = mapped_column(Float)
    config: Mapped[dict[str, object]] = mapped_column(JSON)
    forecast_inputs: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    observed_inputs: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    profile_inputs: Mapped[dict[str, object]] = mapped_column(JSON)
    assumptions: Mapped[list[str]] = mapped_column(JSON)
    limitations: Mapped[list[str] | None] = mapped_column(JSON)
    sources: Mapped[list[dict[str, object]] | None] = mapped_column(JSON)
    response_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSON)
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0", default=False
    )


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    recommendation_id: Mapped[str] = mapped_column(
        ForeignKey("recommendations.id"), unique=True, index=True
    )
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id"), index=True)
    followed: Mapped[bool] = mapped_column(Boolean)
    recommended_minutes: Mapped[float] = mapped_column(Float)
    baseline_minutes: Mapped[float] = mapped_column(Float)
    recommended_depth_mm: Mapped[float] = mapped_column(Float)
    baseline_event_mm: Mapped[float] = mapped_column(Float)
    precipitation_rate_mm_per_hour: Mapped[float] = mapped_column(Float)
    lawn_area_m2: Mapped[float] = mapped_column(Float)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0", default=False
    )
