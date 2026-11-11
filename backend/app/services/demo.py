"""The fixed demo account: one lawn, one replay, one confirmed row per decision.

Every volume written here is a number the same 30-day replay already
produces. Nothing in this module invents a figure, and every row it
writes is tagged ``is_demo`` so it can never reach a real profile.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, time

from sqlalchemy.orm import Session

from app.db import feedback as feedback_store
from app.db import profiles as profile_store
from app.db import recommendations as recommendation_store
from app.db.models import Profile
from app.engine.models import IrrigationConstants
from app.services import backtest as backtest_service
from app.services.backtest import HistoryClient, SimulatedBacktest

DEMO_PROFILE_ID = "demo-austin-lawn"

DEMO_LOCATION_LABEL = "Demo lawn (Austin, TX)"
DEMO_LATITUDE = 30.2672
DEMO_LONGITUDE = -97.7431
DEMO_LAWN_AREA_M2 = 120.0
DEMO_GRASS_TYPE = "fescue"
DEMO_SOIL_TYPE = "loamy"
DEMO_SPRINKLER_TYPE = "rotor"
DEMO_PRECIPITATION_RATE_MM_PER_HOUR = 30.0
DEMO_BASELINE_MINUTES_PER_EVENT = 30
DEMO_EVENTS_PER_WEEK = 3

# A replay day is credited at the end of that day, so a 30-day replay
# always lands inside a 30-day savings window no matter when it is loaded.
DEMO_CREDIT_TIME = time(23, 59, tzinfo=UTC)

DEMO_ROW_PREFIX = "Demo account row"

DEMO_ROW_ASSUMPTION = (
    "Demo account: this row is a decision the engine replayed over observed "
    "weather, credited to that day. It is not a recommendation you confirmed "
    "at the time."
)

DEMO_ROW_UNCERTAINTY = (
    "Demo account: volumes are estimated from observed gridded Open-Meteo "
    "weather and your stated schedule, not measured. No flow meter, water "
    "bill, or soil-moisture sensor is used."
)


@dataclass(frozen=True, slots=True)
class DemoLoadResult:
    profile: Profile
    replay: SimulatedBacktest
    events_written: int
    replay_days: int
    baseline_volume_l: float
    recommended_volume_l: float
    avoided_volume_l: float
    avoided_percent: float


@dataclass(frozen=True, slots=True)
class CannotLoadDemo:
    code: str
    reason: str


DemoLoadOutcome = DemoLoadResult | CannotLoadDemo


@dataclass(frozen=True, slots=True)
class DemoResetResult:
    profile_id: str
    feedback_deleted: int
    recommendations_deleted: int


def ensure_demo_profile(session: Session, *, today: date) -> Profile:
    """Return the one fixed demo lawn, creating it on first use."""
    existing = profile_store.get_profile(session, DEMO_PROFILE_ID)
    if existing is not None:
        return existing

    return profile_store.create_profile(
        session,
        profile_id=DEMO_PROFILE_ID,
        is_demo=True,
        location_label=DEMO_LOCATION_LABEL,
        latitude=DEMO_LATITUDE,
        longitude=DEMO_LONGITUDE,
        lawn_area_m2=DEMO_LAWN_AREA_M2,
        grass_type=DEMO_GRASS_TYPE,
        soil_type=DEMO_SOIL_TYPE,
        sprinkler_type=DEMO_SPRINKLER_TYPE,
        precipitation_rate_mm_per_hour=DEMO_PRECIPITATION_RATE_MM_PER_HOUR,
        baseline_minutes_per_event=DEMO_BASELINE_MINUTES_PER_EVENT,
        events_per_week=DEMO_EVENTS_PER_WEEK,
        last_watered_date=today,
        last_watered_minutes=DEMO_BASELINE_MINUTES_PER_EVENT,
    )


def reset_demo_account(session: Session, *, profile_id: str) -> DemoResetResult:
    """Delete demo-tagged rows for one profile; real rows are never touched."""
    feedback_deleted = feedback_store.delete_demo_feedback(session, profile_id=profile_id)
    recommendations_deleted = recommendation_store.delete_demo_recommendations(
        session, profile_id=profile_id
    )
    return DemoResetResult(
        profile_id=profile_id,
        feedback_deleted=feedback_deleted,
        recommendations_deleted=recommendations_deleted,
    )


def _minutes_for_depth(depth_mm: float, precipitation_rate_mm_per_hour: float) -> float:
    """The inverse of the savings volume formula, so rows and totals agree."""
    return depth_mm / precipitation_rate_mm_per_hour * 60.0


def load_demo_account(
    session: Session,
    *,
    profile: Profile,
    history_client: HistoryClient,
    constants: IrrigationConstants | None,
    now: datetime,
) -> DemoLoadOutcome:
    """Replay 30 days and write one confirmed demo row per replay decision.

    Loading is idempotent: any demo rows from an earlier load are removed
    first, so a profile never counts the same replay twice.
    """
    outcome = backtest_service.backtest_for_profile(
        profile=profile,
        history_client=history_client,
        constants=constants,
        generated_at=now,
    )
    if isinstance(outcome, backtest_service.CannotBacktest):
        return CannotLoadDemo(code=outcome.code, reason=outcome.reason)

    reset_demo_account(session, profile_id=profile.id)

    weather_by_date = {day.date: day for day in outcome.history}
    replay_config = {
        "mode": "simulated_replay",
        "window_start": outcome.start_date.isoformat(),
        "window_end": outcome.end_date.isoformat(),
        "taw_mm": outcome.taw_mm,
        "raw_mm": outcome.raw_mm,
        "skip_threshold_mm": outcome.skip_threshold_mm,
        "irrigation_efficiency": outcome.irrigation_efficiency,
        "baseline_event_mm": outcome.baseline_event_mm,
        "events_per_week": outcome.events_per_week,
        "total_et0_mm": outcome.total_et0_mm,
        "total_rainfall_mm": outcome.total_rainfall_mm,
    }
    profile_inputs = {
        "profile_id": profile.id,
        "location_label": profile.location_label,
        "latitude": profile.latitude,
        "longitude": profile.longitude,
        "lawn_area_m2": profile.lawn_area_m2,
        "grass_type": profile.grass_type,
        "soil_type": profile.soil_type,
        "sprinkler_type": profile.sprinkler_type,
        "precipitation_rate_mm_per_hour": profile.precipitation_rate_mm_per_hour,
        "baseline_minutes_per_event": profile.baseline_minutes_per_event,
        "events_per_week": profile.events_per_week,
        "is_demo": True,
    }
    sources = [asdict(source) for source in outcome.sources]

    events_written = 0
    for step in outcome.steps:
        if not step.scheduled or step.state is None:
            continue

        weather_day = weather_by_date[step.date]
        credited_at = datetime.combine(step.date, DEMO_CREDIT_TIME, tzinfo=UTC)
        recommended_minutes = _minutes_for_depth(
            step.recommended_applied_mm,
            profile.precipitation_rate_mm_per_hour,
        )

        recommendation = recommendation_store.create_recommendation(
            session,
            profile_id=profile.id,
            created_at=credited_at,
            state=step.state,
            recommended_depth_mm=step.recommended_applied_mm,
            recommended_minutes=recommended_minutes,
            baseline_minutes=profile.baseline_minutes_per_event,
            retrieved_at=credited_at,
            weather_mode="observed_history",
            reason=(
                f"{DEMO_ROW_PREFIX}: the engine replayed "
                f"{step.date.isoformat()} as a {step.state} day. Root-zone "
                f"depletion at the start of that day was "
                f"{step.depletion_start_mm:.1f} mm against a "
                f"{outcome.skip_threshold_mm:.1f} mm skip threshold, so the "
                f"replay applied {step.recommended_applied_mm:.1f} mm instead "
                f"of the {outcome.baseline_event_mm:.1f} mm baseline event."
            ),
            uncertainty=DEMO_ROW_UNCERTAINTY,
            taw_mm=outcome.taw_mm,
            raw_mm=outcome.raw_mm,
            skip_threshold_mm=outcome.skip_threshold_mm,
            horizon_days=0,
            projected_depletions_mm=[],
            projected_max_depletion_mm=step.depletion_start_mm,
            baseline_event_mm=outcome.baseline_event_mm,
            irrigation_efficiency=outcome.irrigation_efficiency,
            config=replay_config,
            forecast_inputs=[],
            observed_inputs=[
                {
                    "date": weather_day.date.isoformat(),
                    "et0_mm": weather_day.et0_mm,
                    "precipitation_mm": weather_day.precipitation_mm,
                    "basis": "observed",
                }
            ],
            profile_inputs=profile_inputs,
            assumptions=[DEMO_ROW_ASSUMPTION, *outcome.assumptions],
            limitations=list(outcome.limitations),
            sources=sources,
            is_demo=True,
        )
        feedback_store.create_feedback(
            session,
            recommendation_id=recommendation.id,
            profile_id=profile.id,
            followed=True,
            recommended_minutes=recommended_minutes,
            baseline_minutes=float(profile.baseline_minutes_per_event),
            recommended_depth_mm=step.recommended_applied_mm,
            baseline_event_mm=outcome.baseline_event_mm,
            precipitation_rate_mm_per_hour=profile.precipitation_rate_mm_per_hour,
            lawn_area_m2=profile.lawn_area_m2,
            confirmed_at=credited_at,
            is_demo=True,
        )
        events_written += 1

    return DemoLoadResult(
        profile=profile,
        replay=outcome,
        events_written=events_written,
        replay_days=outcome.window_days,
        baseline_volume_l=outcome.baseline_volume_l,
        recommended_volume_l=outcome.recommended_volume_l,
        avoided_volume_l=outcome.avoided_volume_l,
        avoided_percent=outcome.avoided_percent,
    )
