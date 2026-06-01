import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("includes credentials and parses a successful JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ assets: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ assets: unknown[] }>("/api/assets")).resolves.toEqual({ assets: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/assets", { credentials: "include" });
  });

  it("throws the standard API error shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "Year is too far in the future", field: "metadata.year" }),
          {
            status: 422,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const request = apiRequest("/api/assets");
    await expect(request).rejects.toMatchObject({
      status: 422,
      field: "metadata.year",
      message: "Year is too far in the future",
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });
});
