import { apiRequest } from "./client";
import type { RecommendationState } from "../types/recommendation";

export type WeatherBasis = "observed" | "forecast" | "today_forecast";

export interface WeatherInput {
  date: string;
  et0_mm: number;
  precipitation_mm: number;
  basis: WeatherBasis;
}

export interface RecommendationSource {
  id: string;
  label: string;
  citation: string;
  url: string | null;
}

export interface RecommendationFactor {
  id: string;
  label: string;
  value: string;
  role: "applied" | "context";
  detail: string;
  source_id: string | null;
}

export interface RecommendationFreshness {
  mode: "live" | "cached";
  provider: string;
  retrieved_at: string;
  observed_start: string;
  observed_end: string;
  forecast_start: string;
  forecast_end: string;
  forecast_days_available: number;
  horizon_days: number;
  note: string;
}

export interface RecommendationWhy {
  initial_depletion_mm: number;
  observed_rainfall_mm: number;
  forecast_rainfall_mm: number;
  forecast_et0_mm: number;
  estimated_crop_demand_mm: number;
  taw_mm: number;
  raw_mm: number;
  skip_threshold_mm: number;
  horizon_days: number;
  projected_depletions_mm: number[];
  projected_max_depletion_mm: number;
  baseline_event_mm: number;
  irrigation_efficiency: number;
}

export interface RecommendationDuration {
  recommended_minutes: number;
  baseline_minutes: number;
  suggested_change_minutes: number;
  depth_mm: number;
  precipitation_rate_mm_per_hour: number;
  irrigation_efficiency: number;
  formula: string;
  efficiency_note: string;
}

export interface RecommendationResponse {
  id: string;
  profile_id: string;
  created_at: string;
  state: RecommendationState;
  recommended_depth_mm: number;
  recommended_minutes: number;
  baseline_minutes: number;
  suggested_change_minutes: number;
  reason: string;
  why: RecommendationWhy;
  duration: RecommendationDuration;
  inputs: {
    observed: WeatherInput[];
    forecast: WeatherInput[];
  };
  freshness: RecommendationFreshness;
  sources: RecommendationSource[];
  factors: RecommendationFactor[];
  uncertainty: string;
  limitations: string[];
  assumptions: string[];
  lawn_area_m2: number;
  precipitation_rate_mm_per_hour: number;
  baseline_water_litres: number;
  recommended_water_litres: number;
  avoided_water_litres: number;
}

export function fetchRecommendation(
  profileId: string,
): Promise<RecommendationResponse> {
  return apiRequest<RecommendationResponse>(
    `/profiles/${profileId}/recommendation`,
  );
}

export function fetchStoredRecommendation(
  recommendationId: string,
): Promise<RecommendationResponse> {
  return apiRequest<RecommendationResponse>(`/recommendations/${recommendationId}`);
}
