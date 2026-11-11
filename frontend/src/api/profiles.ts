import { apiRequest } from "./client";

export interface ProfilePayload {
  location_label: string;
  latitude: number;
  longitude: number;
  lawn_area_m2: number;
  grass_type: string;
  soil_type: string;
  sprinkler_type: string;
  precipitation_rate_mm_per_hour: number;
  baseline_minutes_per_event: number;
  events_per_week: number;
  last_watered_date: string;
  last_watered_minutes: number;
}

export interface ProfileResponse extends ProfilePayload {
  id: string;
  is_demo: boolean;
}

export function createProfile(payload: ProfilePayload): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>("/profiles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProfile(
  profileId: string,
  payload: ProfilePayload,
): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>(`/profiles/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getProfile(profileId: string): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>(`/profiles/${profileId}`);
}
