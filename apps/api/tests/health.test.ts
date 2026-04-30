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

type OpenAPIDocument = {
  components: {
    schemas: Record<string, unknown>;
  };
  info: {
    description?: string;
    title: string;
    version: string;
  };
  openapi: string;
  paths: Record<string, unknown>;
  servers: Array<{
    description: string;
    url: string;
  }>;
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

  it("serves a public OpenAPI document", async () => {
    const response = await SELF.fetch("http://example.com/doc");
    const payload = await response.json<OpenAPIDocument>();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload.openapi).toBe("3.0.0");
    expect(payload.info).toEqual({
      description: "Public OpenAPI document for the Pineapple API.",
      title: "Pineapple API",
      version: "1.0.0",
    });
    expect(payload.servers).toEqual([
      {
        url: "http://example.com",
        description: "Current environment",
      },
    ]);
    expect(payload.paths).toHaveProperty("/");
    expect(payload.paths).toHaveProperty("/api/v1/health");
    expect(payload.components.schemas).toHaveProperty("ServiceStatus");
    expect(payload.components.schemas).toHaveProperty("HealthStatus");
  });
});
