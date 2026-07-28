import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiDelete, apiGet, apiPost } from "./client";

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiGet", () => {
  it("includes credentials and parses a successful JSON response", async () => {
    const fetchMock = stubFetch(json({ assets: [], counts: {} }));

    await expect(apiGet("/api/assets")).resolves.toEqual({ assets: [], counts: {} });
    expect(fetchMock).toHaveBeenCalledWith("/api/assets", {
      method: "GET",
      credentials: "include",
    });
  });

  it("substitutes path parameters into the template", async () => {
    const fetchMock = stubFetch(json({ id: "a1" }));

    await apiGet("/api/assets/{id}", { path: { id: "a 1/b" } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assets/a%201%2Fb");
  });

  it("serialises query parameters and drops undefined ones", async () => {
    const fetchMock = stubFetch(json({ entries: [] }));

    await apiGet("/api/activity", { query: { type: "task_completed", limit: 20 } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/activity?type=task_completed&limit=20");
  });

  it("omits the query string entirely when no parameters are set", async () => {
    const fetchMock = stubFetch(json({ notifications: [] }));

    await apiGet("/api/notifications", { query: {} });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/notifications");
  });

  it("throws the standard API error shape", async () => {
    stubFetch(json({ error: "Year is too far in the future", field: "metadata.year" }, 422));

    const request = apiGet("/api/assets");
    await expect(request).rejects.toMatchObject({
      status: 422,
      field: "metadata.year",
      message: "Year is too far in the future",
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });

  it("falls back to a status message when the error body is not the standard shape", async () => {
    stubFetch(new Response("<html>gateway</html>", { status: 502 }));

    await expect(apiGet("/api/assets")).rejects.toMatchObject({
      status: 502,
      message: "Request failed with status 502",
    });
  });
});

describe("apiPost", () => {
  it("sends a JSON body with the content-type header", async () => {
    const fetchMock = stubFetch(json({ id: "a1" }, 201));

    await apiPost("/api/teams", { body: { name: "Field Ops" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/teams", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Field Ops" }),
    });
  });

  it("sends no body when the operation declares none", async () => {
    const fetchMock = stubFetch(json({ unreadCount: 0 }));

    await apiPost("/api/notifications/read-all");

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
  });
});

describe("apiDelete", () => {
  // A 204 carries no body: parsing it as JSON rejects, which is what the
  // untyped client did — deleting a task surfaced a JSON parse error in the UI
  // even though the server had already deleted it.
  it("resolves without parsing a 204 response", async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(
      apiDelete("/api/assets/{assetId}/maintenance-tasks/{taskId}", {
        path: { assetId: "a1", taskId: "t1" },
      }),
    ).resolves.toBeUndefined();
  });
});
