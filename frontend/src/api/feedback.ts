import { apiRequest } from "./client";

export interface FeedbackResponse {
  recommendation_id: string;
  profile_id: string;
  state: string;
  followed: boolean;
  recommended_minutes: number;
  baseline_minutes: number;
  avoided_minutes: number;
  estimated_water_avoided_litres: number;
  confirmed_at: string;
  already_confirmed: boolean;
}

export function confirmRecommendation(
  recommendationId: string,
  followed: boolean,
): Promise<FeedbackResponse> {
  return apiRequest<FeedbackResponse>(
    `/recommendations/${recommendationId}/feedback`,
    {
      method: "POST",
      body: JSON.stringify({ followed }),
    },
  );
}
