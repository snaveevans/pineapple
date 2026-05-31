import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { CREATE_ASSET_BODY_MAX_BYTES, createAssetBodyLimit } from "./createAssetBodyLimit.ts";

describe("createAssetBodyLimit", () => {
  it("rejects JSON request bodies larger than 16 KiB", async () => {
    const app = new Hono();
    app.use("*", createAssetBodyLimit);
    app.post("/", (c) => c.json({ ok: true }));

    const response = await app.request("/", {
      method: "POST",
      body: "a".repeat(CREATE_ASSET_BODY_MAX_BYTES + 1),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body exceeds the 16 KiB limit",
    });
  });
});
