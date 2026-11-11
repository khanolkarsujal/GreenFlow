import type { RecommendationResponse } from "../api/recommendations";

const STORAGE_KEY = "greenflow.last-recommendation.v1";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function loadLastRecommendation(): RecommendationResponse | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Partial<RecommendationResponse>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.profile_id !== "string" ||
      (candidate.state !== "SKIP" &&
        candidate.state !== "REDUCE" &&
        candidate.state !== "WATER") ||
      !isFiniteNumber(candidate.recommended_minutes) ||
      !isFiniteNumber(candidate.baseline_minutes)
    ) {
      return null;
    }

    // A cached record from before the server supplied volumes cannot be
    // shown next to server-derived figures, so it is treated as absent.
    if (
      !isFiniteNumber(candidate.lawn_area_m2) ||
      !isFiniteNumber(candidate.baseline_water_litres) ||
      !isFiniteNumber(candidate.recommended_water_litres) ||
      !isFiniteNumber(candidate.avoided_water_litres)
    ) {
      return null;
    }

    return candidate as RecommendationResponse;
  } catch {
    return null;
  }
}

export function saveLastRecommendation(
  recommendation: RecommendationResponse,
): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(recommendation),
    );
  } catch {
    // The live recommendation is still usable for this view.
  }
}

export function clearLastRecommendation(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
