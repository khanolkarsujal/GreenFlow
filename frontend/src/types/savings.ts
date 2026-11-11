export type DecisionType = "skip" | "reduce" | "water";

export type RecordedAction = "confirmed-skip" | "followed" | "not-recorded";

export type SavingsRange = 7 | 30 | 90 | "all";

export type VolumeUnit = "liters" | "gallons";

export type MonthlyWindow = 3 | 6 | 12;

export interface WateringDecision {
  id: string;
  date: string;
  recommendation: DecisionType;
  normalMinutes: number;
  recommendedMinutes: number;
  action: RecordedAction;
}

export interface SavingsTotals {
  decisions: number;
  normalMinutes: number;
  confirmedAvoidedMinutes: number;
  pendingAvoidedMinutes: number;
  normalVolumeL: number;
  confirmedVolumeL: number;
  pendingVolumeL: number;
  avoidedPercent: number;
  recommendedSkips: number;
  confirmedSkips: number;
  unconfirmedSkips: number;
  confirmedSkipVolumeL: number;
}

export interface DailySavingsPoint {
  date: string;
  confirmedL: number;
  pendingL: number;
  decisions: number;
  confirmedSkips: number;
}

export interface MonthlySavingsPoint {
  month: string;
  label: string;
  confirmedL: number;
  decisions: number;
  confirmedSkips: number;
}
