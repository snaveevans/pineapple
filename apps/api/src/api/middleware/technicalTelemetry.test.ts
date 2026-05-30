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
});
