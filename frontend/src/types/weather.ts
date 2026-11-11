export type WeatherConditionId =
  | "sunny"
  | "partly-cloudy"
  | "cloudy"
  | "showers"
  | "rain";

export type ObservationRangeDays = 7 | 14 | 30;

export type TrendMetric = "water-balance" | "temperature";

export interface DailyObservation {
  date: string;
  rainfallMm: number;
  et0Mm: number;
  tempMaxC: number;
  tempMinC: number;
}

export interface DailyForecast {
  date: string;
  condition: WeatherConditionId;
  rainfallMm: number;
  precipitationProbabilityPct: number;
  tempMaxC: number;
  tempMinC: number;
  et0Mm: number;
  windMaxMs: number;
}

export interface CurrentConditions {
  tempC: number;
  highC: number;
  lowC: number;
  humidityPct: number;
  windMs: number;
  windMaxMs: number;
  rainChancePct: number;
  rainTodayMm: number;
  condition: WeatherConditionId;
  snapshotLabel: string;
}

export interface WeatherDataset {
  isSample: boolean;
  locationLabel: string;
  locationNote: string;
  current: CurrentConditions;
  observations: DailyObservation[];
  forecast: DailyForecast[];
}
