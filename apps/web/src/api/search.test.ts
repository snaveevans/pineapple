import { afterEach, describe, expect, it, vi } from "vitest";
import { searchAssets } from "./search";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchAssets", () => {
  it("calls the app search endpoint with an encoded query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchAssets("ram 2500")).resolves.toEqual({ results: [] });

    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=ram+2500", {
      credentials: "include",
    });
  });
});
