import type { ProfileResponse } from "../api/profiles";
import type { LawnProfile } from "../types/lawnProfile";

const STORAGE_KEY = "greenflow.lawn-profile.v2";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLawnProfile(value: unknown): value is LawnProfile {
  if (!value || typeof value !== "object") return false;

  const profile = value as Partial<LawnProfile>;

  return (
    (profile.backendId === null || typeof profile.backendId === "string") &&
    typeof profile.grassType === "string" &&
    typeof profile.soilType === "string" &&
    typeof profile.sprinklerType === "string" &&
    typeof profile.wateringFrequency === "string" &&
    isFiniteNumber(profile.wateringDurationMinutes) &&
    isFiniteNumber(profile.eventsPerWeek) &&
    isFiniteNumber(profile.precipitationRateMmPerHour) &&
    typeof profile.lastWateredDate === "string" &&
    isFiniteNumber(profile.lastWateredMinutes) &&
    typeof profile.savedAt === "string" &&
    !!profile.lawnArea &&
    isFiniteNumber(profile.lawnArea.value) &&
    isFiniteNumber(profile.lawnArea.areaM2) &&
    (profile.lawnArea.unit === "sqft" || profile.lawnArea.unit === "sqm") &&
    !!profile.location &&
    typeof profile.location.label === "string" &&
    isFiniteNumber(profile.location.latitude) &&
    isFiniteNumber(profile.location.longitude) &&
    (profile.location.source === "manual" ||
      profile.location.source === "device" ||
      profile.location.source === "demo")
  );
}

export function loadLawnProfile(): LawnProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isLawnProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLawnProfile(profile: LawnProfile): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearLawnProfile(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing; nothing to clear.
  }
}

/** The profile fields the engine reads when it calculates an event. */
export interface CalculationInputs {
  lawnAreaM2: number;
  precipitationRateMmPerHour: number;
  baselineMinutesPerEvent: number;
}

/**
 * The server copy of a profile is authoritative: it is what the engine
 * used. The browser keeps a second copy only to render the form, so it is
 * refreshed from the server rather than trusted.
 */
export function withServerProfile(
  profile: LawnProfile,
  server: ProfileResponse,
): LawnProfile {
  return {
    ...profile,
    lawnArea: {
      value: server.lawn_area_m2,
      unit: "sqm",
      areaM2: server.lawn_area_m2,
    },
    location: {
      ...profile.location,
      label: server.location_label,
      latitude: server.latitude,
      longitude: server.longitude,
    },
    precipitationRateMmPerHour: server.precipitation_rate_mm_per_hour,
    wateringDurationMinutes: server.baseline_minutes_per_event,
    eventsPerWeek: server.events_per_week,
    lastWateredDate: server.last_watered_date,
    lastWateredMinutes: server.last_watered_minutes,
    savedAt: new Date().toISOString(),
  };
}

export function sameCalculationInputs(
  profile: LawnProfile,
  server: ProfileResponse,
): boolean {
  return (
    profile.lawnArea.areaM2 === server.lawn_area_m2 &&
    profile.precipitationRateMmPerHour === server.precipitation_rate_mm_per_hour &&
    profile.wateringDurationMinutes === server.baseline_minutes_per_event &&
    profile.eventsPerWeek === server.events_per_week &&
    profile.lastWateredDate === server.last_watered_date &&
    profile.lastWateredMinutes === server.last_watered_minutes
  );
}

/**
 * Whether a recommendation was calculated from the profile as it stands
 * now. The volumes shown beside it belong to the inputs on record.
 */
export function matchesRecommendationInputs(
  profile: LawnProfile,
  inputs: CalculationInputs,
): boolean {
  return (
    profile.lawnArea.areaM2 === inputs.lawnAreaM2 &&
    profile.precipitationRateMmPerHour === inputs.precipitationRateMmPerHour &&
    profile.wateringDurationMinutes === inputs.baselineMinutesPerEvent
  );
}
