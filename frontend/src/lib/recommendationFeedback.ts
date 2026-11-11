import type { RecommendationState } from "../types/recommendation";
import type {
  FeedbackChoice,
  RecommendationFeedback,
} from "../types/recommendationExplanation";

const STORAGE_KEY = "greenflow.recommendation-feedback.v1";

const CHOICES: readonly FeedbackChoice[] = [
  "followed",
  "kept-normal",
  "not-recorded",
];

type FeedbackMap = Record<string, RecommendationFeedback>;

function isFeedback(value: unknown): value is RecommendationFeedback {
  if (!value || typeof value !== "object") return false;

  const entry = value as Partial<RecommendationFeedback>;
  return (
    typeof entry.key === "string" &&
    typeof entry.date === "string" &&
    (entry.state === "SKIP" ||
      entry.state === "REDUCE" ||
      entry.state === "WATER") &&
    typeof entry.choice === "string" &&
    CHOICES.includes(entry.choice as FeedbackChoice) &&
    typeof entry.recordedAt === "string"
  );
}

function readAll(): FeedbackMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const map: FeedbackMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isFeedback(value)) map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

function feedbackKey(date: string, state: RecommendationState): string {
  return `${date}:${state}`;
}

export function loadFeedback(
  date: string,
  state: RecommendationState,
): RecommendationFeedback | null {
  return readAll()[feedbackKey(date, state)] ?? null;
}

export function saveFeedback(
  date: string,
  state: RecommendationState,
  choice: FeedbackChoice,
): RecommendationFeedback | null {
  const entry: RecommendationFeedback = {
    key: feedbackKey(date, state),
    date,
    state,
    choice,
    recordedAt: new Date().toISOString(),
  };

  try {
    const map = readAll();
    map[entry.key] = entry;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return entry;
  } catch {
    return null;
  }
}
