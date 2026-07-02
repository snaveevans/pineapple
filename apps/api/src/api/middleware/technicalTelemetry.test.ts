import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { Email, TooManyRequestsError, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import {
  buildApiRequestTelemetryDataPoint,
  createTechnicalTelemetryMiddleware,
  requestCountry,
  requestUserId,
  statusFromError,
  type ApiRequestTelemetryDataPoint,
} from "./technicalTelemetry.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@snaveevans/pineapple-shared";

const userId = UserId.from("195d0ef0-47f5-439f-abfd-29f892c9a040");

const testUser = User.reconstitute({
  id: userId,
  email: Email.from("test@example.com"),
  name: null,
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

function requestWithCf(url: string, init?: RequestInit & { cf?: { country?: string } }): Request {
  const { cf, ...requestInit } = init ?? {};
  const req = new Request(url, requestInit);
  if (cf !== undefined) {
    Object.defineProperty(req, "cf", { value: cf, configurable: true });
  }
  return req;
}

describe("buildApiRequestTelemetryDataPoint", () => {
  it("maps successful use-case requests to the documented v2 field order", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "POST",
        pathname: "/api/assets",
        status: 201,
        durationMs: 42.5,
        requestSizeBytes: 128,
        authenticated: true,
        country: "US",
        userId,
        error: null,
      }),
    ).toEqual({
      indexes: ["CreateAsset"],
      blobs: [
        "CreateAsset",
        "/api/assets",
        "POST",
        "2xx",
        "201",
        "success",
        "none",
        "true",
        "v2",
        "US",
        userId,
      ],
      doubles: [42.5, 1, 201, 128],
    });
  });

  it("keeps country and user identity independent for unauthenticated requests", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "POST",
        pathname: "/api/auth/sign-in/social",
        status: 401,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: false,
        country: "US",
        userId: "anonymous",
        error: null,
      }),
    ).toMatchObject({
      blobs: [
        "SignIn",
        "/api/auth/sign-in/social",
        "POST",
        "4xx",
        "401",
        "failure",
        "none",
        "false",
        "v2",
        "US",
        "anonymous",
      ],
    });
  });

  it("maps auth sub-routes to their specific operation names", () => {
    const cases: [string, string, string][] = [
      ["POST", "/api/auth/sign-in/social", "SignIn"],
      ["GET", "/api/auth/callback/google", "OAuthCallback"],
      ["GET", "/api/auth/get-session", "SessionCheck"],
      ["POST", "/api/auth/sign-out", "SignOut"],
      ["GET", "/api/auth/csrf", "Auth"],
    ];
    for (const [method, pathname, operation] of cases) {
      expect(
        buildApiRequestTelemetryDataPoint({
          method,
          pathname,
          status: 200,
          durationMs: 1,
          requestSizeBytes: 0,
          authenticated: false,
          country: "GB",
          userId: "anonymous",
          error: null,
        }).indexes[0],
      ).toBe(operation);
    }
  });

  it("normalizes asset ids and records validation failures", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "GET",
        pathname: "/api/assets/195d0ef0-47f5-439f-abfd-29f892c9a040",
        status: 422,
        durationMs: 3,
        requestSizeBytes: 0,
        authenticated: false,
        country: "unknown",
        userId: "anonymous",
        error: new ValidationError("Invalid id", "id"),
      }),
    ).toEqual({
      indexes: ["GetAsset"],
      blobs: [
        "GetAsset",
        "/api/assets/{id}",
        "GET",
        "4xx",
        "422",
        "failure",
        "ValidationError",
        "false",
        "v2",
        "unknown",
        "anonymous",
      ],
      doubles: [3, 1, 422, 0],
    });
  });

  it("maps GET /api/dashboard to GetDashboard", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "GET",
        pathname: "/api/dashboard",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "CA",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: ["GetDashboard"],
      blobs: [
        "GetDashboard",
        "/api/dashboard",
        "GET",
        "2xx",
        "200",
        "success",
        "none",
        "true",
        "v2",
        "CA",
        userId,
      ],
    });
  });

  it("maps GET /api/activity to ListActivity", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "GET",
        pathname: "/api/activity",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "CA",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: ["ListActivity"],
      blobs: [
        "ListActivity",
        "/api/activity",
        "GET",
        "2xx",
        "200",
        "success",
        "none",
        "true",
        "v2",
        "CA",
        userId,
      ],
    });
  });

  it("maps GET /api/search to SearchAssets", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "GET",
        pathname: "/api/search",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "US",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: ["SearchAssets"],
      blobs: [
        "SearchAssets",
        "/api/search",
        "GET",
        "2xx",
        "200",
        "success",
        "none",
        "true",
        "v2",
        "US",
        userId,
      ],
    });
  });

  it.each([
    ["GET", "GetUserProfile"],
    ["PATCH", "UpdateUserProfile"],
  ])("maps %s /api/users/me to %s", (method, operation) => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method,
        pathname: "/api/users/me",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "US",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: [operation],
      blobs: [
        operation,
        "/api/users/me",
        method,
        "2xx",
        "200",
        "success",
        "none",
        "true",
        "v2",
        "US",
        userId,
      ],
    });
  });

  it.each([
    ["PUT", "SetNotificationEmail"],
    ["DELETE", "RemoveNotificationEmail"],
  ])("maps %s /api/users/me/notification-email to %s", (method, operation) => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method,
        pathname: "/api/users/me/notification-email",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "US",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: [operation],
      blobs: [
        operation,
        "/api/users/me/notification-email",
        method,
        "2xx",
        "200",
        "success",
        "none",
        "true",
        "v2",
        "US",
        userId,
      ],
    });
  });

  it("maps POST /api/users/me/notification-email/verification to RequestEmailVerification", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "POST",
        pathname: "/api/users/me/notification-email/verification",
        status: 202,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "US",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: ["RequestEmailVerification"],
      blobs: [
        "RequestEmailVerification",
        "/api/users/me/notification-email/verification",
        "POST",
        "2xx",
        "202",
        "success",
        "none",
        "true",
        "v2",
        "US",
        userId,
      ],
    });
  });

  it("maps POST /api/verify-email to ConfirmEmailVerification (unauthenticated)", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "POST",
        pathname: "/api/verify-email",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: false,
        country: "US",
        userId: "anonymous",
        error: null,
      }),
    ).toMatchObject({
      indexes: ["ConfirmEmailVerification"],
      blobs: [
        "ConfirmEmailVerification",
        "/api/verify-email",
        "POST",
        "2xx",
        "200",
        "success",
        "none",
        "false",
        "v2",
        "US",
        "anonymous",
      ],
    });
  });

  it.each([
    ["POST", "CreateMaintenanceRecord"],
    ["GET", "ListMaintenanceRecords"],
  ])("maps %s maintenance routes to %s", (method, operation) => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method,
        pathname: "/api/assets/195d0ef0-47f5-439f-abfd-29f892c9a040/maintenance-records",
        status: 200,
        durationMs: 1,
        requestSizeBytes: 0,
        authenticated: true,
        country: "US",
        userId,
        error: null,
      }),
    ).toMatchObject({
      indexes: [operation],
      blobs: [
        operation,
        "/api/assets/{assetId}/maintenance-records",
        method,
        "2xx",
        "200",
        "success",
        "none",
        "true",
        "v2",
        "US",
        userId,
      ],
    });
  });
});

describe("requestCountry", () => {
  it("returns the cf country when present", () => {
    expect(requestCountry({ country: "US" })).toBe("US");
  });

  it('returns "unknown" when cf country is absent or empty', () => {
    expect(requestCountry(undefined)).toBe("unknown");
    expect(requestCountry({ country: "" })).toBe("unknown");
  });
});

describe("requestUserId", () => {
  it("returns the authenticated user id", () => {
    expect(requestUserId(testUser)).toBe(userId);
  });

  it('returns "anonymous" when no user is on the context', () => {
    expect(requestUserId(undefined)).toBe("anonymous");
  });
});

describe("statusFromError", () => {
  it("maps domain errors to their HTTP status", () => {
    expect(statusFromError(new NotFoundError("nope"))).toBe(404);
    expect(statusFromError(new UnauthorizedError("nope"))).toBe(401);
    expect(statusFromError(new ForbiddenError("nope"))).toBe(403);
    expect(statusFromError(new ValidationError("nope"))).toBe(422);
    expect(statusFromError(new ConflictError("nope"))).toBe(409);
    expect(statusFromError(new TooManyRequestsError("slow down"))).toBe(429);
  });

  it("maps unknown errors to 500", () => {
    expect(statusFromError(new Error("boom"))).toBe(500);
    expect(statusFromError(null)).toBe(500);
  });
});

describe("createTechnicalTelemetryMiddleware", () => {
  it("writes country from request.cf and user id from context", async () => {
    const written: ApiRequestTelemetryDataPoint[] = [];
    const app = new Hono<{ Variables: { user?: User } }>();
    app.use(
      "*",
      createTechnicalTelemetryMiddleware(() => ({ write: (dp) => written.push(dp) })),
    );
    app.get("/api/dashboard", (c) => {
      c.set("user", testUser);
      return c.json({ ok: true }, 200);
    });

    const response = await app.request(
      requestWithCf("http://localhost/api/dashboard", { cf: { country: "US" } }),
    );
    expect(response.status).toBe(200);
    expect(written[0]?.blobs[9]).toBe("US");
    expect(written[0]?.blobs[10]).toBe(userId);
  });

  it("writes anonymous user id independently of a known country", async () => {
    const written: ApiRequestTelemetryDataPoint[] = [];
    const app = new Hono<{ Variables: { user?: User } }>();
    app.use(
      "*",
      createTechnicalTelemetryMiddleware(() => ({ write: (dp) => written.push(dp) })),
    );
    app.post("/api/auth/sign-in/social", (c) => c.json({ error: "Unauthorized" }, 401));

    const response = await app.request(
      requestWithCf("http://localhost/api/auth/sign-in/social", {
        method: "POST",
        cf: { country: "US" },
      }),
    );
    expect(response.status).toBe(401);
    expect(written[0]?.blobs[9]).toBe("US");
    expect(written[0]?.blobs[10]).toBe("anonymous");
  });

  it('writes "unknown" country when request.cf is absent', async () => {
    const written: ApiRequestTelemetryDataPoint[] = [];
    const app = new Hono<{ Variables: { user?: User } }>();
    app.use(
      "*",
      createTechnicalTelemetryMiddleware(() => ({ write: (dp) => written.push(dp) })),
    );
    app.get("/health", (c) => c.json({ status: "ok" }, 200));

    const response = await app.request("http://localhost/health");
    expect(response.status).toBe(200);
    expect(written[0]?.blobs[9]).toBe("unknown");
    expect(written[0]?.blobs[10]).toBe("anonymous");
  });

  it("does not include the raw search query in telemetry", async () => {
    const written: ApiRequestTelemetryDataPoint[] = [];
    const app = new Hono<{ Variables: { user?: User } }>();
    app.use(
      "*",
      createTechnicalTelemetryMiddleware(() => ({ write: (dp) => written.push(dp) })),
    );
    app.get("/api/search", (c) => {
      c.set("user", testUser);
      return c.json({ results: [] }, 200);
    });

    const response = await app.request("http://localhost/api/search?q=secret-vin-123");

    expect(response.status).toBe(200);
    expect(written[0]?.indexes).toEqual(["SearchAssets"]);
    expect(written[0]?.blobs).not.toContain("secret-vin-123");
  });
});
