export type ApiErrorBody = {
  error: string;
  field?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    if (body.field !== undefined) this.field = body.field;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    (!("field" in value) || value.field === undefined || typeof value.field === "string")
  );
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include" });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(
      response.status,
      isApiErrorBody(body) ? body : { error: `Request failed with status ${response.status}` },
    );
  }

  return (await response.json()) as T;
}
