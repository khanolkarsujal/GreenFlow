import type {
  DailyForecast,
  DailyObservation,
  ObservationRangeDays,
  WeatherDataset,
} from "../types/weather";
import {
  addDays,
  formatTimeOfDay,
  startOfDay,
  toIsoDate,
} from "../lib/weatherFormat";

// 30 completed days, oldest first: [rainfall mm, ET0 mm/day, high °C, low °C].
// The last three days total 12.0 mm, matching the dashboard sample.
const OBSERVED_DAYS: ReadonlyArray<
  readonly [number, number, number, number]
> = [
  [0.0, 2.6, 22, 12],
  [3.2, 3.1, 24, 13],
  [0.0, 3.4, 25, 14],
  [0.0, 2.9, 23, 13],
  [1.4, 3.6, 21, 11],
  [0.0, 3.2, 22, 12],
  [0.0, 2.8, 24, 13],
  [6.8, 3.9, 26, 15],
  [0.2, 3.1, 27, 16],
  [0.0, 2.7, 25, 14],
  [0.0, 3.3, 24, 13],
  [0.0, 3.8, 23, 12],
  [2.6, 4.1, 22, 11],
  [0.0, 3.5, 24, 13],
  [0.0, 2.9, 26, 15],
  [11.4, 3.0, 28, 17],
  [0.0, 3.6, 27, 16],
  [0.0, 4.2, 25, 14],
  [0.0, 3.4, 24, 13],
  [0.8, 2.8, 23, 12],
  [0.0, 3.2, 25, 14],
  [0.0, 3.7, 26, 15],
  [4.2, 4.0, 27, 16],
  [0.0, 3.3, 25, 14],
  [1.8, 2.9, 24, 13],
  [0.0, 3.5, 23, 12],
  [0.0, 3.9, 22, 11],
  [5.6, 4.3, 24, 13],
  [0.4, 3.6, 25, 14],
  [6.0, 3.2, 24, 13],
];

// The first three forecast days total 3.0 mm, matching the dashboard sample.
const FORECAST_DAYS: ReadonlyArray<Omit<DailyForecast, "date">> = [
  {
    condition: "partly-cloudy",
    rainfallMm: 0.2,
    precipitationProbabilityPct: 25,
    tempMaxC: 24,
    tempMinC: 13,
    et0Mm: 3.8,
    windMaxMs: 5.2,
  },
  {
    condition: "showers",
    rainfallMm: 1.6,
    precipitationProbabilityPct: 65,
    tempMaxC: 25,
    tempMinC: 14,
    et0Mm: 4.1,
    windMaxMs: 6.0,
  },
  {
    condition: "rain",
    rainfallMm: 1.2,
    precipitationProbabilityPct: 45,
    tempMaxC: 23,
    tempMinC: 12,
    et0Mm: 4.4,
    windMaxMs: 5.6,
  },
  {
    condition: "sunny",
    rainfallMm: 0,
    precipitationProbabilityPct: 10,
    tempMaxC: 22,
    tempMinC: 11,
    et0Mm: 4.0,
    windMaxMs: 4.8,
  },
  {
    condition: "sunny",
    rainfallMm: 0,
    precipitationProbabilityPct: 5,
    tempMaxC: 26,
    tempMinC: 14,
    et0Mm: 3.6,
    windMaxMs: 4.2,
  },
  {
    condition: "sunny",
    rainfallMm: 0,
    precipitationProbabilityPct: 5,
    tempMaxC: 27,
    tempMinC: 15,
    et0Mm: 3.3,
    windMaxMs: 3.9,
  },
  {
    condition: "cloudy",
    rainfallMm: 3.4,
    precipitationProbabilityPct: 20,
    tempMaxC: 25,
    tempMinC: 14,
    et0Mm: 3.5,
    windMaxMs: 4.6,
  },
];

function buildObservations(today: Date): DailyObservation[] {
  const count = OBSERVED_DAYS.length;

  return OBSERVED_DAYS.map(([rainfallMm, et0Mm, tempMaxC, tempMinC], index) => {
    const daysAgo = count - index;
    return {
      date: toIsoDate(addDays(today, -daysAgo)),
      rainfallMm,
      et0Mm,
      tempMaxC,
      tempMinC,
    };
  });
}

function buildForecast(today: Date): DailyForecast[] {
  return FORECAST_DAYS.map((day, index) => ({
    ...day,
    date: toIsoDate(addDays(today, index)),
  }));
}

export function sampleSnapshotTime(): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    6,
    30,
  );
}

const sampleToday = startOfDay(new Date());

export const sampleWeather: WeatherDataset = {
  isSample: true,
  locationLabel: "Riverside Lawn",
  locationNote: "Sample location",
  current: {
    tempC: 21,
    highC: 24,
    lowC: 13,
    humidityPct: 62,
    windMs: 3.4,
    windMaxMs: 5.2,
    rainChancePct: 25,
    rainTodayMm: 0.2,
    condition: "partly-cloudy",
    snapshotLabel: `Sample reading · ${formatTimeOfDay(sampleSnapshotTime())}`,
  },
  observations: buildObservations(sampleToday),
  forecast: buildForecast(sampleToday),
};

export const TODAY_ISO = toIsoDate(sampleToday);
export const YESTERDAY_ISO = toIsoDate(addDays(sampleToday, -1));

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function observationsForRange(
  range: ObservationRangeDays,
): DailyObservation[] {
  return sampleWeather.observations.slice(-range);
}

export function totalRainfall(days: DailyObservation[]): number {
  return roundToTenth(
    days.reduce((total, day) => total + day.rainfallMm, 0),
  );
}

export function averageRainfall(days: DailyObservation[]): number {
  if (days.length === 0) return 0;
  return totalRainfall(days) / days.length;
}

export function rainyDayCount(days: DailyObservation[]): number {
  return days.filter((day) => day.rainfallMm > 0).length;
}

export function totalEt0(days: DailyObservation[]): number {
  return roundToTenth(days.reduce((total, day) => total + day.et0Mm, 0));
}

export function forecastRainTotal(): number {
  return roundToTenth(
    sampleWeather.forecast.reduce((total, day) => total + day.rainfallMm, 0),
  );
}

export function forecastRainyDays(thresholdMm = 1): number {
  return sampleWeather.forecast.filter(
    (day) => day.rainfallMm >= thresholdMm,
  ).length;
}

export function forecastAverageProbability(): number {
  const forecast = sampleWeather.forecast;
  if (forecast.length === 0) return 0;
  const total = forecast.reduce(
    (sum, day) => sum + day.precipitationProbabilityPct,
    0,
  );
  return Math.round(total / forecast.length);
}

export function forecastEt0Total(): number {
  return roundToTenth(
    sampleWeather.forecast.reduce((total, day) => total + day.et0Mm, 0),
  );
}

export function forecastEt0Average(): number {
  const forecast = sampleWeather.forecast;
  if (forecast.length === 0) return 0;
  return forecastEt0Total() / forecast.length;
}

export function forecastEt0Peak(): number {
  return sampleWeather.forecast.reduce(
    (peak, day) => Math.max(peak, day.et0Mm),
    0,
  );
}

export function forecastTemperatureRange(): {
  high: number;
  low: number;
} {
  return sampleWeather.forecast.reduce(
    (range, day) => ({
      high: Math.max(range.high, day.tempMaxC),
      low: Math.min(range.low, day.tempMinC),
    }),
    { high: Number.NEGATIVE_INFINITY, low: Number.POSITIVE_INFINITY },
  );
}
