import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { InvariantError, ValidationError } from "@snaveevans/pineapple-shared";
import { toHttpError } from "./errors.ts";

describe("toHttpError", () => {
  it("hides invariant details from the response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = new Hono();
    app.get("/", (c) => toHttpError(c, new InvariantError("sensitive implementation detail")));

    const response = await app.request("/");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal Server Error" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("keeps validation details for callers", async () => {
    const app = new Hono();
    app.get("/", (c) => toHttpError(c, new ValidationError("Name is required", "name")));

    const response = await app.request("/");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Name is required", field: "name" });
  });
});
