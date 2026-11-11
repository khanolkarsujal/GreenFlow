import type { HealthResponse } from "../types/health";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "ok"
  );
}

export async function fetchHealth(): Promise<HealthResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/health`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("The backend did not respond. Check that it is running.");
  }

  if (!response.ok) {
    throw new Error(`The backend responded with status ${response.status}.`);
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error("The backend returned a response that was not valid JSON.");
  }

  if (!isHealthResponse(data)) {
    throw new Error("The backend returned an unexpected response.");
  }

  return data;
}
