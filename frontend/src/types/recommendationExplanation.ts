import type { RecommendationState } from "./recommendation";

export type RecommendationPageStatus =
  | "ready"
  | "loading"
  | "error"
  | "empty"
  | "unavailable";

export type FactorDirection = "lowers" | "raises" | "not-applied";

export type ConfidenceLevel = "High" | "Moderate" | "Low";

export type FeedbackChoice = "followed" | "kept-normal" | "not-recorded";

export interface RecommendationScenario {
  state: RecommendationState;
  title: string;
  explanation: string;
  normalMinutes: number;
  recommendedMinutes: number;
  actionTitle: string;
  actionBullets: string[];
}

export interface RecommendationFactor {
  id: string;
  name: string;
  value: string;
  meta: string;
  direction: FactorDirection;
  directionLabel: string;
  explanation: string;
  sourceLabel: string;
}

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  summary: string;
  factors: string[];
}

export interface RecommendationFeedback {
  key: string;
  date: string;
  state: RecommendationState;
  choice: FeedbackChoice;
  recordedAt: string;
}
