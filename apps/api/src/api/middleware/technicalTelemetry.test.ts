import { describe, expect, it } from "vitest";
import { ValidationError } from "@snaveevans/pineapple-shared";
import { buildApiRequestTelemetryDataPoint } from "./technicalTelemetry.ts";

describe("buildApiRequestTelemetryDataPoint", () => {
  it("maps successful use-case requests to the documented field order", () => {
    expect(
      buildApiRequestTelemetryDataPoint({
        method: "POST",
        pathname: "/api/assets",
        status: 201,
        durationMs: 42.5,
        requestSizeBytes: 128,
        authenticated: true,
        error: null,
      }),
    ).toEqual({
      indexes: ["CreateAsset"],
      blobs: ["CreateAsset", "/api/assets", "POST", "2xx", "201", "success", "none", "true", "v1"],
      doubles: [42.5, 1, 201, 128],
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
        "v1",
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
        "v1",
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
        error: null,
      }),
    ).toMatchObject({
      indexes: [operation],
      blobs: [operation, "/api/users/me", method, "2xx", "200", "success", "none", "true", "v1"],
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
        "v1",
      ],
    });
  });
});
