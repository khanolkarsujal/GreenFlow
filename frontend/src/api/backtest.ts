import { apiRequest } from "./client";

export type BacktestState = "SKIP" | "REDUCE" | "WATER";

export interface BacktestStep {
  date: string;
  scheduled: boolean;
  state: BacktestState | null;
  depletion_start_mm: number;
  baseline_applied_mm: number;
  recommended_applied_mm: number;
  depletion_end_mm: number;
}

export interface BacktestInputs {
  lawn_area_m2: number;
  precipitation_rate_mm_per_hour: number;
  baseline_minutes_per_event: number;
  baseline_event_mm: number;
  events_per_week: number;
  irrigation_efficiency: number;
  taw_mm: number;
  raw_mm: number;
  skip_threshold_mm: number;
  total_et0_mm: number;
  total_rainfall_mm: number;
}

export interface BacktestSource {
  id: string;
  label: string;
  citation: string;
  url: string | null;
}

export interface BacktestResponse {
  profile_id: string;
  mode: "simulated_backtest";
  tag: string;
  generated_at: string;
  window_days: number;
  start_date: string;
  end_date: string;
  scheduled_events: number;
  skip_events: number;
  reduce_events: number;
  water_events: number;
  estimated_baseline_litres: number;
  estimated_recommended_litres: number;
  estimated_water_avoided_litres: number;
  estimated_avoided_percent: number;
  inputs: BacktestInputs;
  steps: BacktestStep[];
  assumptions: string[];
  limitations: string[];
  sources: BacktestSource[];
}

export function fetchBacktest(profileId: string): Promise<BacktestResponse> {
  return apiRequest<BacktestResponse>(`/profiles/${profileId}/backtest`);
}
