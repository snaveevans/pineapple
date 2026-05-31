import { describe, expect, it } from "vitest";
import { getApiDocument } from "./openapi.ts";

describe("OpenAPI document", () => {
  it("reflects asset validation limits and hardened responses", () => {
    const document = getApiDocument();

    expect(document.components?.schemas?.["CreateAssetBody"]).toMatchObject({
      properties: {
        name: { minLength: 1, maxLength: 120 },
      },
    });
    expect(document.components?.schemas?.["VehicleMetadata"]).toMatchObject({
      properties: {
        make: { minLength: 1, maxLength: 64 },
        model: { minLength: 1, maxLength: 64 },
        vin: {
          minLength: 17,
          maxLength: 17,
          pattern: "^[A-HJ-NPR-Z0-9]{17}$",
        },
      },
    });
    expect(document.paths["/api/assets"]?.post?.responses).toHaveProperty("413");
    expect(document.paths["/api/assets"]?.post?.responses).toHaveProperty("429");
    expect(document.paths["/api/assets/{id}"]?.get?.responses).not.toHaveProperty("403");
  });
});
