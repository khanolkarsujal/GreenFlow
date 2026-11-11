"""Print the live engine's day-by-day numbers for the demo lawn.

Nothing here re-implements the decision: it calls the same service the API
route calls, against an in-memory SQLite session so no demo row is added.
The table columns are then derived from the numbers that service returns.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.db.models import Profile
from app.engine.constants import resolve_constants
from app.engine.models import EngineDay
from app.engine.water_balance import (
    depletion_after_watering,
    effective_rainfall,
    update_depletion,
)
from app.services import recommendation as svc
from app.services.open_meteo import fetch_daily_weather

DEMO_PROFILE_ID = sys.argv[1] if len(sys.argv) > 1 else None

memory = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(bind=memory)
session = sessionmaker(bind=memory, expire_on_commit=False)()

source = sessionmaker(bind=create_engine("sqlite:///lawn_advisor.db"))()
rows = source.query(Profile).all()
if DEMO_PROFILE_ID:
    rows = [row for row in rows if row.id == DEMO_PROFILE_ID]
if not rows:
    raise SystemExit("No profile found; pass a profile id.")

# Use the most recently created profile matching the demo label.
demo = next((row for row in rows if row.location_label.startswith("Demo lawn")), rows[-1])

profile = Profile(
    id=str(uuid4()),
    location_label=demo.location_label,
    latitude=demo.latitude,
    longitude=demo.longitude,
    lawn_area_m2=demo.lawn_area_m2,
    grass_type=demo.grass_type,
    soil_type=demo.soil_type,
    sprinkler_type=demo.sprinkler_type,
    precipitation_rate_mm_per_hour=demo.precipitation_rate_mm_per_hour,
    baseline_minutes_per_event=demo.baseline_minutes_per_event,
    events_per_week=demo.events_per_week,
    last_watered_date=demo.last_watered_date,
    last_watered_minutes=demo.last_watered_minutes,
)
session.add(profile)
session.commit()

constants = resolve_constants(profile)
now = datetime.now(UTC)
outcome = svc.recommend_for_profile(
    session,
    profile=profile,
    weather_client=fetch_daily_weather,
    constants=constants,
    created_at=now,
)

if not isinstance(outcome, svc.StoredRecommendation):
    raise SystemExit(f"CANNOT_RECOMMEND {outcome.code}: {outcome.reason}")

baseline_event_mm = profile.precipitation_rate_mm_per_hour * profile.baseline_minutes_per_event / 60.0
max_application_mm = constants.max_application_mm

print("=== Profile (demo lawn) ===")
print(
    f"label={profile.location_label} lat={profile.latitude} lon={profile.longitude} "
    f"area={profile.lawn_area_m2} m2"
)
print(
    f"grass={profile.grass_type} soil={profile.soil_type} sprinkler={profile.sprinkler_type}"
)
print(
    f"rate={profile.precipitation_rate_mm_per_hour} mm/h baseline={profile.baseline_minutes_per_event} min "
    f"events_per_week={profile.events_per_week} last_watered={profile.last_watered_date} "
    f"({profile.last_watered_minutes} min)"
)
print()
print("=== Constants actually used ===")
print(
    f"Kc={constants.crop_coefficient} FC={constants.field_capacity} WP={constants.wilting_point} "
    f"root_depth={constants.root_depth_m} m p={constants.depletion_fraction} "
    f"skip_fraction={constants.skip_fraction}"
)
print(
    f"efficiency={constants.irrigation_efficiency} I_max(max_application_mm)={max_application_mm} "
    f"baseline_event_mm={round(baseline_event_mm, 4)} horizon_cap={constants.horizon_cap_days} d"
)
print()
print("=== Observed lead-in (from your last watering to today) ===")
print(
    f"{'date':<12}{'basis':<14}{'depl.start':>11}  {'ET0':>6}  {'ETc':>8}  {'rain':>6}"
    f"  {'eff.rain':>8}  {'depl.end':>8}"
)
# The service returns the depletion the horizon starts from but not each
# observed day's roll-forward, so replay those same days with the same
# engine function and check that the last one lands on that number.
taw_mm = outcome.taw_mm
roll = None
for item in outcome.observed_inputs:
    et0 = float(item["et0_mm"])
    rain = float(item["precipitation_mm"])
    etc = constants.crop_coefficient * et0
    if roll is None:
        # first observed day: the day of the recorded watering
        applied_mm = (
            profile.precipitation_rate_mm_per_hour * profile.last_watered_minutes / 60.0
        )
        roll = depletion_after_watering(
            taw_mm=taw_mm,
            raw_mm=outcome.raw_mm,
            applied_mm=applied_mm,
        )
        print(f"(start of {item['date']}: refill point {outcome.raw_mm:.4f} mm "
              f"- watering {applied_mm:.4f} mm = {roll:.4f} mm depletion)")
    start = roll
    eff = effective_rainfall(rain, start)
    roll = update_depletion(
        start,
        EngineDay(date=item["date"], et0_mm=et0, precipitation_mm=rain),
        crop_coefficient=constants.crop_coefficient,
        taw_mm=taw_mm,
    )
    print(
        f"{str(item['date']):<12}{str(item['basis']):<14}{start:>11.4f}  {et0:>6.2f}"
        f"  {etc:>8.4f}  {rain:>6.2f}  {eff:>8.4f}  {roll:>8.4f}"
    )
print(
    f"replayed depletion entering the horizon = {round(roll, 4)} mm; "
    f"service initial_depletion_mm = {round(outcome.initial_depletion_mm, 4)} mm; "
    f"difference = {abs(roll - outcome.initial_depletion_mm):.2e} mm"
)
print()
print("=== Forecast horizon, day by day ===")
print(
    f"{'day':<4}{'date':<12}{'depl.start':>11}  {'ET0':>6}  {'ETc':>8}  {'rain':>6}"
    f"  {'eff.rain':>8}  {'depl.end':>8}  {'check':>9}"
)
start = outcome.initial_depletion_mm
for index, item in enumerate(outcome.forecast_inputs, start=1):
    et0 = float(item["et0_mm"])
    rain = float(item["precipitation_mm"])
    etc = constants.crop_coefficient * et0
    eff = effective_rainfall(rain, start)
    end = float(outcome.projected_depletions_mm[index - 1])
    recomputed = max(0.0, min(start + etc - eff, outcome.taw_mm))
    print(
        f"{index:<4}{str(item['date']):<12}{start:>11.4f}  {et0:>6.2f}  {etc:>8.4f}"
        f"  {rain:>6.2f}  {eff:>8.4f}  {end:>8.4f}  {abs(recomputed - end):>9.2e}"
    )
    start = end
print()
print("=== Summary ===")
print(f"TAW = {round(outcome.taw_mm, 4)} mm")
print(f"RAW = {round(outcome.raw_mm, 4)} mm  (p={constants.depletion_fraction} x TAW)")
print(
    f"skip threshold = {round(outcome.skip_threshold_mm, 4)} mm  "
    f"({constants.skip_fraction} x RAW)"
)
print(
    f"horizon = {outcome.horizon_days} days  "
    f"(ceil(7 / {profile.events_per_week} per week), capped at {constants.horizon_cap_days})"
)
print(f"projected depletions = {[round(v, 4) for v in outcome.projected_depletions_mm]}")
print(f"peak projected depletion = {round(outcome.projected_max_depletion_mm, 4)} mm")
before_cap = outcome.projected_max_depletion_mm / constants.irrigation_efficiency
after_cap = min(before_cap, max_application_mm)
print(f"depth before I_max cap = peak / efficiency = {round(before_cap, 4)} mm")
print(f"depth after  I_max cap = min(before, {max_application_mm}) = {round(after_cap, 4)} mm")
print(f"engine recommended_depth_mm = {round(outcome.recommended_depth_mm, 4)} mm")
print(f"baseline event depth = {round(baseline_event_mm, 4)} mm")
print(f"STATE = {outcome.state.value}   reason: {outcome.reason}")
minutes = outcome.recommended_minutes
print(
    f"minutes = depth / rate x 60 = {round(outcome.recommended_depth_mm, 4)} / "
    f"{profile.precipitation_rate_mm_per_hour} x 60 = "
    f"{round(outcome.recommended_depth_mm / profile.precipitation_rate_mm_per_hour * 60, 4)} -> {minutes} min"
    f" (baseline {outcome.baseline_minutes} min, change {outcome.suggested_change_minutes} min)"
)
