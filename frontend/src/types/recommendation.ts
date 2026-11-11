export type RecommendationState = "SKIP" | "REDUCE" | "WATER";

export interface RecommendationWhy {
  rainfallReceivedMm: number;
  rainfallExpectedMm: number;
  estimatedDemandMm: number;
  uncertainty: string;
}
