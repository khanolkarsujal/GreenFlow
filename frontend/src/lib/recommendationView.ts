import type { RecommendationResponse } from "../api/recommendations";

/**
 * The one place the frontend turns a recommendation into displayed
 * figures. Screens read these fields instead of deriving their own, so
 * the same recommendation cannot show two different numbers.
 *
 * Volumes arrive from the server; nothing here multiplies minutes.
 */

export interface RecommendationFacts {
  recommendationId: string;
  profileId: string;
  generatedAt: string;
  weatherRetrievedAt: string;
  state: RecommendationResponse["state"];
  lawnAreaM2: number;
  precipitationRateMmPerHour: number;
  irrigationEfficiency: number;
  soilDepletionMm: number;
  projectedMaxDepletionMm: number;
  requiredDepthMm: number;
  baselineDepthMm: number;
  recommendedMinutes: number;
  baselineMinutes: number;
  suggestedChangeMinutes: number;
  recommendedWaterLitres: number;
  baselineWaterLitres: number;
  avoidedWaterLitres: number;
  effectiveRainfallMm: number;
  referenceEt0Mm: number;
}

export function factsFor(
  recommendation: RecommendationResponse,
): RecommendationFacts {
  return {
    recommendationId: recommendation.id,
    profileId: recommendation.profile_id,
    generatedAt: recommendation.created_at,
    weatherRetrievedAt: recommendation.freshness.retrieved_at,
    state: recommendation.state,
    lawnAreaM2: recommendation.lawn_area_m2,
    precipitationRateMmPerHour: recommendation.precipitation_rate_mm_per_hour,
    irrigationEfficiency: recommendation.why.irrigation_efficiency,
    soilDepletionMm: recommendation.why.initial_depletion_mm,
    projectedMaxDepletionMm: recommendation.why.projected_max_depletion_mm,
    requiredDepthMm: recommendation.recommended_depth_mm,
    baselineDepthMm: recommendation.why.baseline_event_mm,
    recommendedMinutes: recommendation.recommended_minutes,
    baselineMinutes: recommendation.baseline_minutes,
    suggestedChangeMinutes: recommendation.suggested_change_minutes,
    recommendedWaterLitres: recommendation.recommended_water_litres,
    baselineWaterLitres: recommendation.baseline_water_litres,
    avoidedWaterLitres: recommendation.avoided_water_litres,
    effectiveRainfallMm:
      recommendation.why.observed_rainfall_mm +
      recommendation.why.forecast_rainfall_mm,
    referenceEt0Mm: recommendation.why.forecast_et0_mm,
  };
}

export const METRIC_LABELS = {
  soilDepletionMm: "Soil water depletion",
  requiredDepthMm: "Water needed by the lawn",
  recommendedMinutes: "Recommended run time",
  recommendedWaterLitres: "Water the lawn needs",
  baselineWaterLitres: "Water your normal schedule applies",
  avoidedWaterLitres: "Water avoided by this advice",
} as const;
