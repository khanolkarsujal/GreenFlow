import test from "node:test";
import assert from "node:assert/strict";

import type { BacktestResponse } from "../api/backtest";
import type { SavingsResponse } from "../api/savings";
import {
  buildSavingsHero,
  CONFIRMED_HERO_LABEL,
  DEMO_HERO_TAG,
  demoHeroNote,
  SIMULATED_HERO_BANNER,
  SIMULATED_HERO_LABEL,
  SIMULATED_HERO_TAG,
} from "./savingsHero.ts";

function savings(overrides: Partial<SavingsResponse> = {}): SavingsResponse {
  return {
    profile_id: "profile-1",
    is_demo: false,
    window_days: 30,
    generated_at: "2026-11-05T07:00:00Z",
    confirmed_count: 3,
    followed_count: 2,
    not_followed_count: 1,
    pending_count: 4,
    estimated_baseline_litres: 10_800,
    estimated_recommended_litres: 7_440,
    estimated_water_avoided_litres: 3_360,
    estimated_avoided_percent: 31.11,
    average_avoided_litres_per_day: 112,
    average_avoided_litres_per_week: 784,
    events: [],
    pending: [],
    assumptions: [],
    ...overrides,
  };
}

function replay(overrides: Partial<BacktestResponse> = {}): BacktestResponse {
  return {
    profile_id: "profile-1",
    mode: "simulated_backtest",
    tag: SIMULATED_HERO_BANNER,
    generated_at: "2026-11-05T07:00:00Z",
    window_days: 30,
    start_date: "2026-10-06",
    end_date: "2026-11-04",
    scheduled_events: 13,
    skip_events: 3,
    reduce_events: 10,
    water_events: 0,
    estimated_baseline_litres: 46_800,
    estimated_recommended_litres: 14_321,
    estimated_water_avoided_litres: 32_479,
    estimated_avoided_percent: 69.4,
    inputs: {
      lawn_area_m2: 120,
      precipitation_rate_mm_per_hour: 30,
      baseline_minutes_per_event: 60,
      baseline_event_mm: 30,
      events_per_week: 3,
      irrigation_efficiency: 0.6,
      taw_mm: 19.5,
      raw_mm: 7.8,
      skip_threshold_mm: 3.9,
      total_et0_mm: 109.7,
      total_rainfall_mm: 51.4,
    },
    steps: [],
    assumptions: [],
    limitations: [],
    sources: [],
    ...overrides,
  };
}

test("a positive confirmed total keeps the hero and ignores the replay", () => {
  const hero = buildSavingsHero(savings(), replay());

  assert.equal(hero.source, "confirmed");
  assert.equal(hero.valueLitres, 3_360);
  assert.equal(hero.label, CONFIRMED_HERO_LABEL);
  assert.equal(hero.kicker, "Last 30 days · confirmed recommendations only");
  assert.equal(hero.showConfirmedBar, true);
  assert.equal(hero.banner, null);
  assert.equal(hero.baseline.litres, 10_800);
  assert.equal(hero.planned?.litres, 7_440);
  assert.equal(hero.showRing, true);
  assert.equal(hero.showShareAvoided, true);
  assert.equal(hero.shareAvoidedPercent, 31.11);
  assert.equal(hero.showConfirmedSummary, false);

  // The replay figure is neither substituted nor added on.
  assert.notEqual(hero.valueLitres, 32_479);
  assert.equal(hero.valueLitres, 3_360);
});

test("zero confirmed savings put the replay in the hero, labelled simulated", () => {
  const hero = buildSavingsHero(
    savings({
      estimated_water_avoided_litres: 0,
      estimated_avoided_percent: 0,
      estimated_recommended_litres: 10_800,
    }),
    replay(),
  );

  assert.equal(hero.source, "simulated_replay");
  assert.equal(hero.valueLitres, 32_479);
  assert.equal(
    hero.label,
    "Estimated water avoided - simulated replay of the last 30 days",
  );
  assert.equal(hero.label, SIMULATED_HERO_LABEL);
  assert.equal(hero.kicker, SIMULATED_HERO_LABEL);
  assert.equal(hero.showConfirmedBar, false);
  assert.equal(hero.banner, SIMULATED_HERO_BANNER);
  assert.equal(hero.baseline.label, "Baseline schedule");
  assert.equal(hero.baseline.litres, 46_800);
  assert.equal(hero.planned?.label, "Simulated advice");
  assert.equal(hero.showRing, false);
  assert.equal(hero.showShareAvoided, false);
  assert.equal(hero.showConfirmedSummary, true);
});

test("the 0% ring and share avoided stay hidden until confirmed savings exist", () => {
  const withReplay = buildSavingsHero(
    savings({ estimated_water_avoided_litres: 0, estimated_avoided_percent: 0 }),
    replay(),
  );
  const withoutReplay = buildSavingsHero(
    savings({ estimated_water_avoided_litres: 0, estimated_avoided_percent: 0 }),
    null,
  );

  assert.equal(withReplay.showRing, false);
  assert.equal(withReplay.showShareAvoided, false);
  assert.equal(withoutReplay.showRing, false);
  assert.equal(withoutReplay.showShareAvoided, false);
  assert.equal(withoutReplay.source, "confirmed");
  assert.equal(withoutReplay.valueLitres, 0);
  assert.equal(withoutReplay.showConfirmedSummary, false);
});

test("a replay figure is never returned under a confirmed label", () => {
  const cases: Array<[number, BacktestResponse | null]> = [
    [0, replay()],
    [0, replay({ estimated_water_avoided_litres: 0 })],
    [0, null],
    [1, replay()],
    [3_360, replay()],
    [12_000, replay({ estimated_water_avoided_litres: 32_479 })],
  ];

  for (const [confirmed, backtest] of cases) {
    const hero = buildSavingsHero(
      savings({
        estimated_water_avoided_litres: confirmed,
        estimated_avoided_percent: confirmed > 0 ? 31 : 0,
      }),
      backtest,
    );
    const replayValue = backtest?.estimated_water_avoided_litres ?? null;
    const showsReplay =
      replayValue !== null &&
      hero.valueLitres === replayValue &&
      hero.source === "simulated_replay";

    if (showsReplay) {
      assert.doesNotMatch(hero.label, /confirmed/i);
      assert.match(hero.label, /simulated/i);
      assert.equal(hero.banner, SIMULATED_HERO_BANNER);
    } else {
      assert.equal(hero.label, CONFIRMED_HERO_LABEL);
      assert.equal(hero.valueLitres, confirmed);
    }

    // The two totals are reported apart, never summed. With nothing
    // confirmed the sum equals the replay by arithmetic, so the guard only
    // bites once confirmed savings exist.
    if (backtest !== null && confirmed > 0) {
      assert.notEqual(
        hero.valueLitres,
        confirmed + backtest.estimated_water_avoided_litres,
        "the hero must not add confirmed and simulated volumes",
      );
    }
  }
});

test("a demo profile shows its confirmed total under the demo tag", () => {
  const hero = buildSavingsHero(
    savings({
      is_demo: true,
      confirmed_count: 13,
      followed_count: 13,
      estimated_water_avoided_litres: 9_115,
      estimated_baseline_litres: 23_400,
      estimated_recommended_litres: 14_285,
    }),
    replay(),
  );

  assert.equal(hero.source, "confirmed");
  assert.equal(hero.isDemo, true);
  assert.equal(hero.valueLitres, 9_115);
  assert.equal(hero.label, CONFIRMED_HERO_LABEL);
  assert.equal(hero.tag, DEMO_HERO_TAG);
  assert.equal(
    hero.note,
    "Demo account: 30 days replayed from real weather, assuming every recommendation was followed. Estimate, not measured.",
  );
  assert.equal(hero.note, demoHeroNote(30));
  assert.equal(hero.banner, null);
  assert.equal(hero.showRing, true);
  assert.equal(hero.showConfirmedSummary, false);

  // The seeded rows carry the replay's own total; the hero still never
  // quotes the replay panel figure as a second, larger number.
  assert.notEqual(hero.valueLitres, 32_479);
});

test("an unloaded demo lawn keeps the replay label and makes no demo claim", () => {
  const hero = buildSavingsHero(
    savings({
      is_demo: true,
      confirmed_count: 0,
      followed_count: 0,
      estimated_water_avoided_litres: 0,
      estimated_avoided_percent: 0,
      average_avoided_litres_per_day: 0,
      average_avoided_litres_per_week: 0,
    }),
    replay(),
  );

  assert.equal(hero.source, "simulated_replay");
  assert.equal(hero.isDemo, true);
  assert.equal(hero.tag, SIMULATED_HERO_TAG);
  assert.equal(hero.note, null);
  assert.doesNotMatch(hero.label, /confirmed/i);
});

test("a real profile never inherits the demo tag or note", () => {
  const hero = buildSavingsHero(savings({ is_demo: false }), replay());

  assert.equal(hero.isDemo, false);
  assert.equal(hero.tag, "Estimated water avoided");
  assert.equal(hero.note, null);
});
