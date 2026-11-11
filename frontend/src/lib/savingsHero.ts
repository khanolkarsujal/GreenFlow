import type { BacktestResponse } from "../api/backtest";
import type { SavingsResponse } from "../api/savings";

export const SIMULATED_HERO_LABEL =
  "Estimated water avoided - simulated replay of the last 30 days";

export const SIMULATED_HERO_BANNER = "Simulated, not your confirmed actions";

export const CONFIRMED_HERO_LABEL = "Estimated water avoided";

export const CONFIRMED_HERO_TAG = "Estimated water avoided";

export const SIMULATED_HERO_TAG = "Simulated replay";

export const DEMO_HERO_TAG = "Demo data";

export function demoHeroNote(windowDays: number): string {
  return `Demo account: ${windowDays} days replayed from real weather, assuming every recommendation was followed. Estimate, not measured.`;
}

export interface SavingsHeroFigure {
  label: string;
  litres: number;
}

export interface SavingsHero {
  source: "confirmed" | "simulated_replay";
  isDemo: boolean;
  valueLitres: number;
  label: string;
  kicker: string;
  tag: string;
  banner: string | null;
  note: string | null;
  baseline: SavingsHeroFigure;
  planned: SavingsHeroFigure | null;
  showRing: boolean;
  showShareAvoided: boolean;
  showConfirmedBar: boolean;
  shareAvoidedPercent: number;
  showConfirmedSummary: boolean;
}

/**
 * Decides which single figure the savings hero may carry.
 *
 * The two totals are never combined: the hero shows the confirmed total while
 * it is above zero, and otherwise the simulated replay, always labelled as
 * simulated. A replay number can never be returned under the confirmed label,
 * and a demo profile's confirmed total always carries the demo tag.
 */
export function buildSavingsHero(
  savings: SavingsResponse,
  backtest: BacktestResponse | null,
): SavingsHero {
  const confirmedAvoided = savings.estimated_water_avoided_litres;
  const confirmedKicker = `Last ${savings.window_days} days · confirmed recommendations only`;
  const isDemo = savings.is_demo === true;

  if (confirmedAvoided > 0) {
    return {
      source: "confirmed",
      isDemo,
      valueLitres: confirmedAvoided,
      label: CONFIRMED_HERO_LABEL,
      kicker: confirmedKicker,
      tag: isDemo ? DEMO_HERO_TAG : CONFIRMED_HERO_TAG,
      banner: null,
      note: isDemo ? demoHeroNote(savings.window_days) : null,
      baseline: {
        label: "Baseline volume",
        litres: savings.estimated_baseline_litres,
      },
      planned: {
        label: "Water actually planned",
        litres: savings.estimated_recommended_litres,
      },
      showRing: true,
      showShareAvoided: true,
      showConfirmedBar: true,
      shareAvoidedPercent: savings.estimated_avoided_percent,
      showConfirmedSummary: false,
    };
  }

  if (backtest === null) {
    return {
      source: "confirmed",
      isDemo,
      valueLitres: 0,
      label: CONFIRMED_HERO_LABEL,
      kicker: confirmedKicker,
      tag: isDemo ? DEMO_HERO_TAG : CONFIRMED_HERO_TAG,
      banner: null,
      note: null,
      baseline: {
        label: "Baseline volume",
        litres: savings.estimated_baseline_litres,
      },
      planned: {
        label: "Water actually planned",
        litres: savings.estimated_recommended_litres,
      },
      showRing: false,
      showShareAvoided: false,
      showConfirmedBar: false,
      shareAvoidedPercent: 0,
      showConfirmedSummary: false,
    };
  }

  return {
    source: "simulated_replay",
    isDemo,
    valueLitres: backtest.estimated_water_avoided_litres,
    label: SIMULATED_HERO_LABEL,
    kicker: SIMULATED_HERO_LABEL,
    tag: SIMULATED_HERO_TAG,
    banner: SIMULATED_HERO_BANNER,
    note: null,
    baseline: {
      label: "Baseline schedule",
      litres: backtest.estimated_baseline_litres,
    },
    planned: {
      label: "Simulated advice",
      litres: backtest.estimated_recommended_litres,
    },
    showRing: false,
    showShareAvoided: false,
    showConfirmedBar: false,
    shareAvoidedPercent: 0,
    showConfirmedSummary: true,
  };
}
