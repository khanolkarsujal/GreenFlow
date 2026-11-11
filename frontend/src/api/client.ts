const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  code?: string;
  message?: string;
  detail?: string;
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const candidate = body as ErrorBody;
    if (typeof candidate.message === "string" && candidate.message) {
      return candidate.message;
    }
    if (typeof candidate.detail === "string" && candidate.detail) {
      return candidate.detail;
    }
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "The GreenFlow backend did not respond. Check that it is running.",
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof body === "object" && body !== null && "code" in body
        ? String((body as ErrorBody).code)
        : "request_failed",
      messageFromBody(
        body,
        `The backend responded with status ${response.status}.`,
      ),
    );
  }

  if (body === null) {
    throw new ApiError(
      response.status,
      "invalid_response",
      "The backend returned a response that was not valid JSON.",
    );
  }

  return body as T;
}
