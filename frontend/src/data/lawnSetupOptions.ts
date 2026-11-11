import type {
  GrassTypeId,
  LawnSizeUnit,
  SoilTypeId,
  SprinklerTypeId,
  WateringFrequencyId,
} from "../types/lawnProfile";

export interface SelectOption<T extends string> {
  id: T;
  label: string;
  description: string;
  image: string;
  imageAlt: string;
  tag?: string;
}

export interface LawnSizePreset {
  id: "small" | "medium" | "large";
  label: string;
  sqft: number;
  sqm: number;
}

export interface FrequencyOption {
  id: WateringFrequencyId;
  label: string;
  description: string;
}

export const SQFT_PER_SQM = 10.7639;

export const LAWN_SIZE_PRESETS: LawnSizePreset[] = [
  { id: "small", label: "Small lawn", sqft: 1000, sqm: 93 },
  { id: "medium", label: "Medium lawn", sqft: 3000, sqm: 279 },
  { id: "large", label: "Large lawn", sqft: 6000, sqm: 557 },
];

export const WATERING_DURATION_PRESETS = [10, 15, 20, 30, 45, 60];

export const GRASS_OPTIONS: SelectOption<GrassTypeId>[] = [
  {
    id: "bermuda",
    label: "Bermuda Grass",
    description: "Fine, dense turf with a bright green color.",
    image: "/images/grass-bermuda.jpg",
    imageAlt: "Close-up of a dense, bright green Bermuda grass lawn",
  },
  {
    id: "kentucky-bluegrass",
    label: "Kentucky Bluegrass",
    description: "Fine blades with a deep blue-green color.",
    image: "/images/grass-kentucky.jpg",
    imageAlt: "Close-up of fine Kentucky bluegrass blades",
  },
  {
    id: "fescue",
    label: "Fescue",
    description: "Slightly broader blades and a durable texture.",
    image: "/images/grass-fescue.jpg",
    imageAlt: "Close-up of a tall fescue lawn with broader blades",
  },
  {
    id: "zoysia",
    label: "Zoysia",
    description: "Fine, carpet-like turf with a dense growth habit.",
    image: "/images/grass-zoysia.jpg",
    imageAlt: "Close-up of a dense, carpet-like Zoysia lawn",
  },
  {
    id: "st-augustine",
    label: "St. Augustine",
    description: "Broad, coarse blades and a thick, sprawling texture.",
    image: "/images/grass-st-augustine.jpg",
    imageAlt: "Close-up of broad St. Augustine grass blades",
  },
  {
    id: "other",
    label: "Other / Not sure",
    description: "Not sure? Continue with a general lawn profile.",
    image: "/images/grass-other.jpg",
    imageAlt: "Close-up of a healthy mixed-species lawn",
    tag: "No guess needed",
  },
];

export const SOIL_OPTIONS: SelectOption<SoilTypeId>[] = [
  {
    id: "sandy",
    label: "Sandy soil",
    description: "Light, coarse particles that drain quickly.",
    image: "/images/soil-sandy.jpg",
    imageAlt: "Close-up of light, coarse sandy soil",
  },
  {
    id: "clay",
    label: "Clay soil",
    description: "Dense, heavy particles that stay wet longer.",
    image: "/images/soil-clay.jpg",
    imageAlt: "Close-up of dense reddish-brown clay soil",
  },
  {
    id: "loamy",
    label: "Loamy soil",
    description: "A balanced mix of sand, silt, and clay.",
    image: "/images/soil-loamy.jpg",
    imageAlt: "Close-up of rich, dark loamy garden soil",
  },
  {
    id: "silty",
    label: "Silty soil",
    description: "Fine, smooth particles that feel soft when dry.",
    image: "/images/soil-silty.jpg",
    imageAlt: "Close-up of fine, pale silty soil",
  },
  {
    id: "not-sure",
    label: "Not sure",
    description: "No problem — you can continue without guessing.",
    image: "/images/soil-not-sure.jpg",
    imageAlt: "Close-up of mixed garden soil with small stones",
    tag: "No guess needed",
  },
];

export const SPRINKLER_OPTIONS: SelectOption<SprinklerTypeId>[] = [
  {
    id: "fixed-spray",
    label: "Fixed spray sprinklers",
    description: "Popup heads that spray a fixed fan of water.",
    image: "/images/sprinkler-fixed-spray.jpg",
    imageAlt: "Popup fixed spray sprinkler watering a green lawn",
  },
  {
    id: "rotor",
    label: "Rotor sprinklers",
    description: "Popup heads that send a rotating stream across the lawn.",
    image: "/images/sprinkler-rotor.jpg",
    imageAlt: "Popup rotor sprinkler sending a stream across a lawn",
  },
  {
    id: "oscillating",
    label: "Oscillating sprinklers",
    description: "Portable bar sprinklers that sweep water side to side.",
    image: "/images/sprinkler-oscillating.jpg",
    imageAlt: "Oscillating bar sprinkler watering a residential lawn",
  },
  {
    id: "drip",
    label: "Drip irrigation",
    description: "Tubing that delivers water slowly near the soil.",
    image: "/images/sprinkler-drip.jpg",
    imageAlt: "Drip irrigation tubing running through a garden bed",
  },
  {
    id: "hose",
    label: "Manual watering / Hose",
    description: "A hose or movable sprinkler you operate by hand.",
    image: "/images/sprinkler-hose.jpg",
    imageAlt: "Garden hose with a spray nozzle watering a lawn",
  },
  {
    id: "not-sure",
    label: "Other / Not sure",
    description: "Not sure? Continue with a general watering setup.",
    image: "/images/sprinkler-other.jpg",
    imageAlt: "Brass sprinkler head and coiled garden hose on a lawn",
    tag: "No guess needed",
  },
];

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  {
    id: "daily",
    label: "Every day",
    description: "One cycle each day",
  },
  {
    id: "two-three-times",
    label: "2–3 times per week",
    description: "A few scheduled days",
  },
  {
    id: "four-five-times",
    label: "4–5 times per week",
    description: "Most days of the week",
  },
  {
    id: "weekly",
    label: "Once a week",
    description: "A single weekly cycle",
  },
  {
    id: "custom",
    label: "Custom schedule",
    description: "A pattern you set yourself",
  },
];

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function presetValueForUnit(
  preset: LawnSizePreset,
  unit: LawnSizeUnit,
): number {
  return unit === "sqft" ? preset.sqft : preset.sqm;
}

export function areaLabel(value: number, unit: LawnSizeUnit): string {
  return `${formatNumber(value)} ${unit === "sqft" ? "sq ft" : "m²"}`;
}
