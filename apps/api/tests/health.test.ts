import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type RootPayload = {
  product: string;
  service: string;
  status: string;
};

type HealthPayload = RootPayload & {
  requestId: string;
  timestamp: string;
};

describe("health routes", () => {
  it("returns service metadata from the root route", async () => {
    const response = await SELF.fetch("http://example.com/");
    const payload = await response.json<RootPayload>();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      service: "pineapple-api",
      product: "FieldOps",
      status: "ok",
    });
    expect(response.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("returns a generated request id from the health route", async () => {
    const response = await SELF.fetch("http://example.com/api/v1/health");
    const payload = await response.json<HealthPayload>();

    expect(response.status).toBe(200);
    expect(payload.service).toBe("pineapple-api");
    expect(payload.product).toBe("FieldOps");
    expect(payload.status).toBe("ok");
    expect(payload.requestId).toBe(response.headers.get("x-request-id"));
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it("echoes an existing request id", async () => {
    const requestId = "req-fixed-id";
    const response = await SELF.fetch("http://example.com/api/v1/health", {
      headers: {
        "x-request-id": requestId,
      },
    });
    const payload = await response.json<HealthPayload>();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(payload.requestId).toBe(requestId);
  });
});
