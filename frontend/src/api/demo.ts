import type { ProfileResponse } from "./profiles";
import { apiRequest } from "./client";

export interface DemoAccountResponse {
  mode: "demo_account";
  tag: string;
  note: string;
  generated_at: string;
  profile: ProfileResponse;
  events_written: number;
  replay_days: number;
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
  assumptions: string[];
}

export interface DemoResetResponse {
  mode: "demo_account";
  tag: string;
  note: string;
  profile_id: string;
  feedback_deleted: number;
  recommendations_deleted: number;
}

export function loadDemoAccount(): Promise<DemoAccountResponse> {
  return apiRequest<DemoAccountResponse>("/demo/account", { method: "POST" });
}

export function resetDemoAccount(): Promise<DemoResetResponse> {
  return apiRequest<DemoResetResponse>("/demo/account/reset", { method: "POST" });
}
