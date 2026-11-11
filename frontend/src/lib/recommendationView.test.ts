import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { RecommendationResponse } from "../api/recommendations";
import type { SavingsEvent } from "../api/savings";
import { matchesRecommendationInputs } from "./lawnProfileStorage.ts";
import { factsFor } from "./recommendationView.ts";
import type { LawnProfile } from "../types/lawnProfile";

// A recommendation whose depth does not survive a whole-minute round trip:
// 12.34 mm at 10 mm/h is 74.04 minutes, and 74 minutes implies 12.33 mm, so
// litres rebuilt from the rounded minutes land 0.8 L away from the engine.
const RECOMMENDATION: RecommendationResponse = {
  id: "rec-1",
  profile_id: "profile-1",
  created_at: "2026-11-05T07:00:00Z",
  state: "REDUCE",
  recommended_depth_mm: 12.34,
  recommended_minutes: 74,
  baseline_minutes: 90,
  suggested_change_minutes: -16,
  reason: "Projected depletion sits below a full baseline event.",
  why: {
    initial_depletion_mm: 18,
    observed_rainfall_mm: 2,
    forecast_rainfall_mm: 4,
    forecast_et0_mm: 12,
    estimated_crop_demand_mm: 11.4,
    taw_mm: 40,
    raw_mm: 20,
    skip_threshold_mm: 10,
    horizon_days: 5,
    projected_depletions_mm: [12, 14, 16, 18, 12.34],
    projected_max_depletion_mm: 12.34,
    baseline_event_mm: 15,
    irrigation_efficiency: 0.6,
  },
  duration: {
    recommended_minutes: 74,
    baseline_minutes: 90,
    suggested_change_minutes: -16,
    depth_mm: 12.34,
    precipitation_rate_mm_per_hour: 10,
    irrigation_efficiency: 0.6,
    formula: "minutes = depth_mm ÷ precipitation_rate_mm_per_hour × 60",
    efficiency_note: "Gross application.",
  },
  inputs: { observed: [], forecast: [] },
  freshness: {
    mode: "live",
    provider: "Open-Meteo",
    retrieved_at: "2026-11-05T07:00:00Z",
    observed_start: "2026-10-29",
    observed_end: "2026-11-04",
    forecast_start: "2026-11-05",
    forecast_end: "2026-11-11",
    forecast_days_available: 7,
    horizon_days: 5,
    note: "Live.",
  },
  sources: [],
  factors: [],
  uncertainty: "Test fixture.",
  limitations: [],
  assumptions: [],
  lawn_area_m2: 120,
  precipitation_rate_mm_per_hour: 10,
  baseline_water_litres: 1800,
  recommended_water_litres: 1480.8,
  avoided_water_litres: 319.2,
};

function savingsEvent(
  overrides: Partial<SavingsEvent> = {},
): SavingsEvent {
  return {
    recommendation_id: RECOMMENDATION.id,
    state: RECOMMENDATION.state,
    followed: true,
    baseline_minutes: RECOMMENDATION.baseline_minutes,
    recommended_minutes: RECOMMENDATION.recommended_minutes,
    avoided_minutes: 16,
    baseline_depth_mm: RECOMMENDATION.why.baseline_event_mm,
    recommended_depth_mm: RECOMMENDATION.recommended_depth_mm,
    estimated_baseline_litres: RECOMMENDATION.baseline_water_litres,
    estimated_recommended_litres: RECOMMENDATION.recommended_water_litres,
    estimated_water_avoided_litres: RECOMMENDATION.avoided_water_litres,
    confirmed_at: "2026-11-05T09:00:00Z",
    ...overrides,
  };
}

// The profile the fixture recommendation was calculated from.
function lawnProfile(): LawnProfile {
  return {
    backendId: RECOMMENDATION.profile_id,
    lawnArea: { value: 120, unit: "sqm", areaM2: 120 },
    location: {
      label: "Test lawn",
      latitude: 30.27,
      longitude: -97.74,
      source: "manual",
    },
    grassType: "bermuda",
    soilType: "loamy",
    sprinklerType: "rotor",
    precipitationRateMmPerHour: RECOMMENDATION.precipitation_rate_mm_per_hour,
    wateringDurationMinutes: RECOMMENDATION.baseline_minutes,
    wateringFrequency: "two-three-times",
    eventsPerWeek: 3,
    lastWateredDate: "2026-11-03",
    lastWateredMinutes: 90,
    savedAt: "2026-11-05T06:00:00Z",
  };
}

function pageSource(name: string): string {  const url = new URL(`../pages/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8").replace(/\s+/g, " ");
}

test("the shared view reads the server volumes without recalculating them", () => {
  const facts = factsFor(RECOMMENDATION);

  assert.equal(facts.recommendedWaterLitres, 1480.8);
  assert.equal(facts.baselineWaterLitres, 1800);
  assert.equal(facts.avoidedWaterLitres, 319.2);
  assert.equal(facts.requiredDepthMm, 12.34);
  assert.equal(facts.recommendedMinutes, 74);
  assert.equal(facts.lawnAreaM2, 120);
  assert.equal(facts.recommendationId, RECOMMENDATION.id);
  assert.equal(facts.weatherRetrievedAt, RECOMMENDATION.freshness.retrieved_at);
});

test("baseline minus recommended equals avoided", () => {
  const facts = factsFor(RECOMMENDATION);

  assert.ok(
    Math.abs(
      facts.baselineWaterLitres - facts.recommendedWaterLitres - facts.avoidedWaterLitres,
    ) < 1e-9,
    "the three volumes must reconcile exactly",
  );
});

test("litres derived from rounded minutes would disagree with the server", () => {
  const facts = factsFor(RECOMMENDATION);
  const fromMinutes =
    (Math.max(0, facts.baselineMinutes - facts.recommendedMinutes) / 60) *
    facts.precipitationRateMmPerHour *
    facts.lawnAreaM2;

  assert.notEqual(fromMinutes, facts.avoidedWaterLitres);
  assert.ok(
    Math.abs(fromMinutes - facts.avoidedWaterLitres) >= 0.5,
    "the old minutes round trip disagreed with the engine by half a litre or more",
  );
});

test("the savings screen and the recommendation screen report the same litres", () => {
  const facts = factsFor(RECOMMENDATION);
  const event = savingsEvent();

  assert.equal(event.recommendation_id, facts.recommendationId);
  assert.equal(event.estimated_baseline_litres, facts.baselineWaterLitres);
  assert.equal(
    event.estimated_recommended_litres,
    facts.recommendedWaterLitres,
  );
  assert.equal(
    event.estimated_water_avoided_litres,
    facts.avoidedWaterLitres,
  );
});

const RECOMMENDATION_SOURCES = [
  "DashboardPage.tsx",
  "RecommendationExplanationPage.tsx",
  "WaterSavingsPage.tsx",
];

function derivesLitresFromMinutes(source: string): boolean {
  return (
    /(recommended_minutes|baseline_minutes|avoided_minutes)[^;]{0,80}\*\s*[^;]{0,80}(precipitation_rate_mm_per_hour|areaM2|lawn_area_m2)/.test(
      source,
    ) ||
    /\/\s*60[^;]{0,80}\*[^;]{0,80}(precipitation_rate_mm_per_hour|areaM2|lawn_area_m2)/.test(
      source,
    )
  );
}

test("no screen converts minutes into litres itself", () => {
  const offenders = RECOMMENDATION_SOURCES.filter((name) =>
    derivesLitresFromMinutes(pageSource(name)),
  );

  assert.deepEqual(
    offenders,
    [],
    `${offenders.join(", ")} must display the stored volumes instead of deriving them`,
  );
});

test("both recommendation screens read the one shared view", () => {
  const offenders = [
    "DashboardPage.tsx",
    "RecommendationExplanationPage.tsx",
  ].filter((name) => {
    const source = pageSource(name);
    return (
      !source.includes("factsFor(") ||
      !source.includes("METRIC_LABELS") ||
      derivesLitresFromMinutes(source)
    );
  });

  assert.deepEqual(
    offenders,
    [],
    `${offenders.join(", ")} must render volumes and labels taken from factsFor()`,
  );
});

test("a profile edited after the advice was given is flagged, not silently mixed", () => {
  const local = lawnProfile();
  const facts = factsFor(RECOMMENDATION);

  assert.equal(
    matchesRecommendationInputs(local, {
      lawnAreaM2: facts.lawnAreaM2,
      precipitationRateMmPerHour: facts.precipitationRateMmPerHour,
      baselineMinutesPerEvent: facts.baselineMinutes,
    }),
    true,
    "the fixture profile is the one the fixture recommendation was calculated from",
  );

  const edited = { ...local, lawnArea: { ...local.lawnArea, areaM2: 240 } };

  assert.equal(
    matchesRecommendationInputs(edited, {
      lawnAreaM2: facts.lawnAreaM2,
      precipitationRateMmPerHour: facts.precipitationRateMmPerHour,
      baselineMinutesPerEvent: facts.baselineMinutes,
    }),
    false,
    "a changed area means the stored volumes no longer describe the current profile",
  );
});
