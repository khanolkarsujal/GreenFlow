import type { ProfileResponse } from "../api/profiles";
import type {
  GrassTypeId,
  LawnProfile,
  SoilTypeId,
  SprinklerTypeId,
  WateringFrequencyId,
} from "../types/lawnProfile";

const GRASS_IDS = new Set<string>([
  "bermuda",
  "kentucky-bluegrass",
  "fescue",
  "zoysia",
  "st-augustine",
  "other",
]);

const SOIL_IDS = new Set<string>(["sandy", "clay", "loamy", "silty", "not-sure"]);

const SPRINKLER_IDS = new Set<string>([
  "fixed-spray",
  "rotor",
  "oscillating",
  "drip",
  "hose",
  "not-sure",
]);

function pick<T extends string>(
  value: string,
  allowed: Set<string>,
  fallback: T,
): T {
  return allowed.has(value) ? (value as T) : fallback;
}

export function frequencyForEvents(eventsPerWeek: number): WateringFrequencyId {
  if (eventsPerWeek >= 7) return "daily";
  if (eventsPerWeek >= 4) return "four-five-times";
  if (eventsPerWeek >= 2) return "two-three-times";
  return "weekly";
}

/**
 * Turns the backend's fixed demo lawn into the shape every page reads.
 *
 * Every field comes from the profile the server returned, so the browser
 * never carries a second copy of the demo defaults.
 */
export function demoProfileToLawnProfile(
  profile: ProfileResponse,
  savedAt: string,
): LawnProfile {
  return {
    backendId: profile.id,
    lawnArea: {
      value: profile.lawn_area_m2,
      unit: "sqm",
      areaM2: profile.lawn_area_m2,
    },
    location: {
      label: profile.location_label,
      latitude: profile.latitude,
      longitude: profile.longitude,
      source: "demo",
    },
    grassType: pick<GrassTypeId>(profile.grass_type, GRASS_IDS, "other"),
    soilType: pick<SoilTypeId>(profile.soil_type, SOIL_IDS, "not-sure"),
    sprinklerType: pick<SprinklerTypeId>(
      profile.sprinkler_type,
      SPRINKLER_IDS,
      "not-sure",
    ),
    precipitationRateMmPerHour: profile.precipitation_rate_mm_per_hour,
    wateringDurationMinutes: profile.baseline_minutes_per_event,
    wateringFrequency: frequencyForEvents(profile.events_per_week),
    eventsPerWeek: profile.events_per_week,
    lastWateredDate: profile.last_watered_date,
    lastWateredMinutes: profile.last_watered_minutes,
    savedAt,
  };
}
