export type LawnSizeUnit = "sqft" | "sqm";

export type GrassTypeId =
  | "bermuda"
  | "kentucky-bluegrass"
  | "fescue"
  | "zoysia"
  | "st-augustine"
  | "other";

export type SoilTypeId = "sandy" | "clay" | "loamy" | "silty" | "not-sure";

export type SprinklerTypeId =
  | "fixed-spray"
  | "rotor"
  | "oscillating"
  | "drip"
  | "hose"
  | "not-sure";

export type WateringFrequencyId =
  | "daily"
  | "two-three-times"
  | "four-five-times"
  | "weekly"
  | "custom";

export type LocationSource = "manual" | "device" | "demo";

export interface LawnArea {
  value: number;
  unit: LawnSizeUnit;
  areaM2: number;
}

export interface ProfileLocation {
  label: string;
  latitude: number;
  longitude: number;
  source: LocationSource;
}

export interface LawnProfile {
  backendId: string | null;
  lawnArea: LawnArea;
  location: ProfileLocation;
  grassType: GrassTypeId;
  soilType: SoilTypeId;
  sprinklerType: SprinklerTypeId;
  precipitationRateMmPerHour: number;
  wateringDurationMinutes: number;
  wateringFrequency: WateringFrequencyId;
  eventsPerWeek: number;
  lastWateredDate: string;
  lastWateredMinutes: number;
  savedAt: string;
}

// "2–3 times per week" is stored as its upper bound so the profile has a
// single integer. The value sets the decision horizon (days until the next
// scheduled watering).
export const EVENTS_PER_WEEK: Record<WateringFrequencyId, number> = {
  daily: 7,
  "two-three-times": 3,
  "four-five-times": 5,
  weekly: 1,
  custom: 3,
};
