import { apiRequest } from "./client";

export interface SavingsEvent {
  recommendation_id: string;
  state: string;
  followed: boolean;
  baseline_minutes: number;
  recommended_minutes: number;
  avoided_minutes: number;
  baseline_depth_mm: number;
  recommended_depth_mm: number;
  estimated_baseline_litres: number;
  estimated_recommended_litres: number;
  estimated_water_avoided_litres: number;
  confirmed_at: string;
}

export interface PendingRecommendation {
  recommendation_id: string;
  state: string;
  recommended_minutes: number;
  baseline_minutes: number;
  created_at: string;
}

export interface SavingsResponse {
  profile_id: string;
  is_demo: boolean;
  window_days: number;
  generated_at: string;
  confirmed_count: number;
  followed_count: number;
  not_followed_count: number;
  pending_count: number;
  estimated_baseline_litres: number;
  estimated_recommended_litres: number;
  estimated_water_avoided_litres: number;
  estimated_avoided_percent: number;
  average_avoided_litres_per_day: number;
  average_avoided_litres_per_week: number;
  events: SavingsEvent[];
  pending: PendingRecommendation[];
  assumptions: string[];
}

export function fetchSavings(
  profileId: string,
  windowDays: number,
): Promise<SavingsResponse> {
  return apiRequest<SavingsResponse>(
    `/profiles/${profileId}/savings?window_days=${windowDays}`,
  );
}
