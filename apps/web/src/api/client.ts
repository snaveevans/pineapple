const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type SessionUser = { email: string; name?: string | null };

export type CreateAssetPayload =
  | {
      name: string;
      metadata: { kind: "vehicle"; make: string; model: string; year: number; vin?: string };
    }
  | {
      name: string;
      metadata: {
        kind: "property";
        nickname?: string;
        address: {
          street: string;
          city: string;
          state: string;
          postalCode: string;
          country: string;
        };
      };
    }
  | {
      name: string;
      metadata: {
        kind: "equipment";
        manufacturer?: string;
        modelNumber?: string;
        serialNumber?: string;
      };
    };

type ApiErrorBody = { error?: string; field?: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function throwApiError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiError(body?.error ?? "Request failed", response.status, body?.field);
}

export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch(`${API_BASE}/api/auth/get-session`, { credentials: "include" });
  if (!response.ok) return throwApiError(response);
  const body = (await response.json()) as { user?: SessionUser } | null;
  return body?.user ?? null;
}

export async function startGoogleSignIn(callbackURL: string, errorCallbackURL: string) {
  const response = await fetch(`${API_BASE}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ provider: "google", callbackURL, errorCallbackURL }),
  });
  if (!response.ok) return throwApiError(response);
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Sign-in response is missing the redirect URL");
  window.location.href = body.url;
}

export async function signOut() {
  const response = await fetch(`${API_BASE}/api/auth/sign-out`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: "{}",
  });
  if (!response.ok) return throwApiError(response);
}

export async function createAsset(payload: CreateAssetPayload): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE}/api/assets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) return throwApiError(response);
  return (await response.json()) as { id: string };
}
