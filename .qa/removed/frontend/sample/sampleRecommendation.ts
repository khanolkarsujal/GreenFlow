import {
  FREQUENCY_OPTIONS,
  GRASS_OPTIONS,
  SOIL_OPTIONS,
  SPRINKLER_OPTIONS,
  areaLabel,
} from "../data/lawnSetupOptions";
import {
  formatDecimal,
  formatMonthDay,
  isoToDate,
} from "../lib/weatherFormat";
import type { LawnProfile } from "../types/lawnProfile";
import type { RecommendationState } from "../types/recommendation";
import type {
  ConfidenceAssessment,
  RecommendationFactor,
  RecommendationScenario,
} from "../types/recommendationExplanation";
import {
  observationsForRange,
  sampleWeather,
  totalEt0,
} from "./sampleWeather";

const SAMPLE_NORMAL_MINUTES = 30;
const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const recentRainDays = sampleWeather.observations.slice(-3);
const upcomingDays = sampleWeather.forecast.slice(0, 3);
const observedWeek = observationsForRange(7);
const latestObservation = sampleWeather.observations.at(-1);
const todayForecast = sampleWeather.forecast[0];

const recentRainMm = roundToTenth(
  recentRainDays.reduce((sum, day) => sum + day.rainfallMm, 0),
);
const forecastRainMm = roundToTenth(
  upcomingDays.reduce((sum, day) => sum + day.rainfallMm, 0),
);
const rainChanceNext3AvgPct =
  upcomingDays.length > 0
    ? Math.round(
        upcomingDays.reduce(
          (sum, day) => sum + day.precipitationProbabilityPct,
          0,
        ) / upcomingDays.length,
      )
    : 0;

export const recommendationWeather = {
  recentRainMm,
  forecastRainMm,
  rainChanceTodayPct: todayForecast?.precipitationProbabilityPct ?? 0,
  rainChanceNext3AvgPct,
  tempC: sampleWeather.current.tempC,
  highC: sampleWeather.current.highC,
  lowC: sampleWeather.current.lowC,
  et0TodayMm: todayForecast?.et0Mm ?? 0,
  et0WeekAverageMm:
    observedWeek.length > 0 ? roundToTenth(totalEt0(observedWeek) / observedWeek.length) : 0,
  observedThrough: latestObservation?.date ?? "",
  forecastThrough: upcomingDays.at(-1)?.date ?? "",
  observedWeek,
  upcomingDays,
  snapshotLabel: sampleWeather.current.snapshotLabel,
  locationLabel: sampleWeather.locationLabel,
  locationNote: sampleWeather.locationNote,
} as const;

export const recommendationDateIso =
  sampleWeather.forecast[0]?.date ?? "";

export const recommendationDate = isoToDate(
  recommendationDateIso || new Date().toISOString().slice(0, 10),
);

export const recommendationLimitations = [
  "ET₀ is a reference evapotranspiration rate, not the exact water requirement of every lawn.",
  "Rainfall measurements may differ from the rain that actually reached your lawn.",
  "Weather forecasts can change after this recommendation is shown.",
  "Soil conditions and drainage vary across a lawn and may differ from the saved profile.",
  "Sprinkler output may not be uniform because of pressure, spacing, or clogged heads.",
  "GreenFlow provides guidance, not a direct measurement of soil moisture.",
  "Consider local conditions, such as shade and slope, before changing your watering plan.",
] as const;

export const weatherConfidence: ConfidenceAssessment = {
  level: "Moderate",
  summary:
    "The sample dataset is complete, but it is a fixed illustration rather than live local observations.",
  factors: [
    "Rainfall comes from a sample dataset, not an on-site rain gauge.",
    "The 7-day forecast is complete, but rainfall amounts and timing can change.",
    "No soil-moisture sensor or measured sprinkler flow is available.",
  ],
};

export const recommendationConfidence: ConfidenceAssessment = {
  level: "Low",
  summary:
    "This is an illustrative scenario, not a production engine result. Verified irrigation constants and a measured delivery rate are not configured in this build.",
  factors: [
    "The production engine returns cannot-recommend until verified constants exist.",
    "The saved Lawn Profile has no measured flow or precipitation rate.",
    "Soil and grass constants are not applied to the sample calculation.",
    "The normal schedule is assumed; user-reported history is not connected.",
  ],
};

function normalMinutesFor(profile: LawnProfile | null): number {
  return profile?.wateringDurationMinutes ?? SAMPLE_NORMAL_MINUTES;
}

export function buildScenario(
  state: RecommendationState,
  profile: LawnProfile | null,
): RecommendationScenario {
  const normalMinutes = normalMinutesFor(profile);

  if (state === "SKIP") {
    return {
      state,
      title: "SKIP TODAY",
      explanation:
        "Recent rainfall may have supplied enough water to reduce the need for additional irrigation.",
      normalMinutes,
      recommendedMinutes: 0,
      actionTitle: "Do not run today's scheduled cycle",
      actionBullets: [
        "Do not run the scheduled watering cycle today.",
        "Leave your existing timer unchanged unless you choose to modify it.",
        "Reassess the lawn and forecast before the next scheduled cycle.",
      ],
    };
  }

  if (state === "REDUCE") {
    const recommendedMinutes =
      normalMinutes > 15 ? 15 : Math.max(0, normalMinutes - 5);

    return {
      state,
      title: "REDUCE TODAY",
      explanation:
        "Recent rainfall and forecast rain may cover part of the lawn's demand, but some irrigation may still help.",
      normalMinutes,
      recommendedMinutes,
      actionTitle: "Shorten today's scheduled cycle",
      actionBullets: [
        `Shorten today's cycle from ${normalMinutes} to ${recommendedMinutes} minutes if your timer allows it.`,
        "Keep the same start time and watering days.",
        "Reassess before the next scheduled cycle or after new rainfall.",
      ],
    };
  }

  return {
    state,
    title: "WATER TODAY",
    explanation:
      "Rainfall so far may not fully meet demand, and forecast rain is uncertain, so the normal cycle may still be appropriate.",
    normalMinutes,
    recommendedMinutes: normalMinutes,
    actionTitle: "Follow your normal watering schedule",
    actionBullets: [
      "Run your normal watering cycle at the scheduled time.",
      "Check that sprinkler heads cover the lawn evenly.",
      "Reassess after the next rainfall or forecast update.",
    ],
  };
}

export function buildFactors(profile: LawnProfile | null): RecommendationFactor[] {
  const grass = profile
    ? GRASS_OPTIONS.find((option) => option.id === profile.grassType)
    : undefined;
  const soil = profile
    ? SOIL_OPTIONS.find((option) => option.id === profile.soilType)
    : undefined;

  return [
    {
      id: "recent-rain",
      name: "Recent rainfall",
      value: `${formatDecimal(recommendationWeather.recentRainMm)} mm`,
      meta: `Observed · last 72 hours through ${formatMonthDay(recommendationWeather.observedThrough)}`,
      direction: "lowers",
      directionLabel: "Lowers estimated need",
      explanation:
        "Rain recorded near the lawn can refill part of the root zone, so less irrigation may be needed.",
      sourceLabel: "Water-balance input",
    },
    {
      id: "forecast-rain",
      name: "Forecast rainfall",
      value: `${formatDecimal(recommendationWeather.forecastRainMm)} mm`,
      meta: `Forecast · next 3 days through ${formatMonthDay(recommendationWeather.forecastThrough)}`,
      direction: "lowers",
      directionLabel: "Lowers estimated need",
      explanation:
        "Forecast rain is projected into the water balance, but it is less certain than observed rainfall.",
      sourceLabel: "Water-balance input",
    },
    {
      id: "et0",
      name: "Reference ET₀",
      value: `${formatDecimal(recommendationWeather.et0TodayMm)} mm/day`,
      meta: "Forecast reference value for today",
      direction: "raises",
      directionLabel: "Raises estimated need",
      explanation:
        "Higher atmospheric water demand removes more water from the lawn and can increase irrigation need.",
      sourceLabel: "Water-balance input",
    },
    {
      id: "soil",
      name: "Soil characteristics",
      value: soil?.label ?? "Not saved",
      meta: "Lawn Profile context",
      direction: "not-applied",
      directionLabel: "Not applied in this sample",
      explanation:
        "Soil affects how quickly water drains or is retained. Verified soil constants are not configured, so this factor is not calculated here.",
      sourceLabel: "Profile context — not applied",
    },
    {
      id: "grass",
      name: "Grass type",
      value: grass?.label ?? "Not saved",
      meta: "Lawn Profile context",
      direction: "not-applied",
      directionLabel: "Not applied in this sample",
      explanation:
        "Grass type affects water use. A verified crop coefficient is not configured, so this factor is not calculated here.",
      sourceLabel: "Profile context — not applied",
    },
  ];
}

export interface LawnSummaryRow {
  label: string;
  value: string;
  missing?: boolean;
}

export function buildLawnSummary(profile: LawnProfile | null): LawnSummaryRow[] {
  if (!profile) {
    return [
      { label: "Lawn size", value: "Not saved", missing: true },
      { label: "Grass type", value: "Not saved", missing: true },
      { label: "Soil type", value: "Not saved", missing: true },
      { label: "Sprinkler type", value: "Not saved", missing: true },
      {
        label: "Normal schedule",
        value: `${SAMPLE_NORMAL_MINUTES} min · sample baseline`,
      },
    ];
  }

  const grass = GRASS_OPTIONS.find((option) => option.id === profile.grassType);
  const soil = SOIL_OPTIONS.find((option) => option.id === profile.soilType);
  const sprinkler = SPRINKLER_OPTIONS.find(
    (option) => option.id === profile.sprinklerType,
  );
  const frequency = FREQUENCY_OPTIONS.find(
    (option) => option.id === profile.wateringFrequency,
  );

  return [
    {
      label: "Lawn size",
      value: areaLabel(profile.lawnArea.value, profile.lawnArea.unit),
    },
    { label: "Grass type", value: grass?.label ?? "Not saved", missing: !grass },
    { label: "Soil type", value: soil?.label ?? "Not saved", missing: !soil },
    {
      label: "Sprinkler type",
      value: sprinkler?.label ?? "Not saved",
      missing: !sprinkler,
    },
    {
      label: "Normal schedule",
      value: `${profile.wateringDurationMinutes} min · ${frequency?.label ?? "Custom schedule"}`,
    },
  ];
}
