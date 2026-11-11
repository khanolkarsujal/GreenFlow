import type {
  RecommendationState,
  RecommendationWhy,
} from "../types/recommendation";

export interface ChartDay {
  label: string;
  rainfallMm: number;
  demandMm: number;
}

export interface SavingsNote {
  baseline: string;
  assumptions: string;
}

export interface TodayStat {
  label: string;
  sublabel: string;
  value: string;
  unit: string;
  isEstimate?: boolean;
  note?: SavingsNote;
}

export interface RecentDecision {
  dateLabel: string;
  state: RecommendationState;
  followed: boolean;
}

export interface TodaySample {
  recommendation: {
    state: RecommendationState;
    reason: string;
    why: RecommendationWhy;
  };
  stats: TodayStat[];
  chart: {
    baselineMm: number;
    days: ChartDay[];
  };
  decisions: RecentDecision[];
}

export const sampleToday: TodaySample = {
  recommendation: {
    state: "SKIP",
    reason: "Rain is forecast for today, so you can skip watering.",
    why: {
      rainfallReceivedMm: 2.4,
      rainfallExpectedMm: 8.0,
      estimatedDemandMm: 2.1,
      uncertainty: "Rain is forecast but not certain.",
    },
  },
  stats: [
    {
      label: "Estimated water avoided",
      sublabel: "This week vs your normal schedule",
      value: "1,240",
      unit: "L",
      isEstimate: true,
      note: {
        baseline:
          "The same week watered on your normal schedule (sample baseline).",
        assumptions:
          "Sample lawn size, sprinkler flow, and run time. This is an estimate, not measured water use.",
      },
    },
    {
      label: "Recommendations followed",
      sublabel: "Last 30 days",
      value: "18",
      unit: "of 24 decisions",
    },
    {
      label: "Watering events skipped",
      sublabel: "Last 30 days",
      value: "9",
      unit: "events",
    },
  ],
  chart: {
    baselineMm: 3.0,
    days: [
      { label: "Oct 22", rainfallMm: 0.0, demandMm: 2.0 },
      { label: "Oct 23", rainfallMm: 1.2, demandMm: 1.8 },
      { label: "Oct 24", rainfallMm: 0.0, demandMm: 2.3 },
      { label: "Oct 25", rainfallMm: 4.6, demandMm: 0.5 },
      { label: "Oct 26", rainfallMm: 0.0, demandMm: 2.4 },
      { label: "Oct 27", rainfallMm: 0.8, demandMm: 2.1 },
      { label: "Oct 28", rainfallMm: 0.0, demandMm: 2.5 },
      { label: "Oct 29", rainfallMm: 0.0, demandMm: 2.2 },
      { label: "Oct 30", rainfallMm: 2.4, demandMm: 1.9 },
      { label: "Oct 31", rainfallMm: 0.0, demandMm: 2.6 },
      { label: "Nov 1", rainfallMm: 6.2, demandMm: 0.7 },
      { label: "Nov 2", rainfallMm: 0.0, demandMm: 2.4 },
      { label: "Nov 3", rainfallMm: 0.6, demandMm: 2.0 },
      { label: "Nov 4", rainfallMm: 8.0, demandMm: 2.1 },
    ],
  },
  decisions: [
    { dateLabel: "Nov 3", state: "SKIP", followed: true },
    { dateLabel: "Nov 2", state: "WATER", followed: true },
    { dateLabel: "Nov 1", state: "REDUCE", followed: false },
    { dateLabel: "Oct 31", state: "SKIP", followed: true },
  ],
};
