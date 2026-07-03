import { afterEach, describe, expect, it, vi } from "vitest";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "./notifications";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notifications API", () => {
  it("calls the inbox endpoint with cursor pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ notifications: [], unreadCount: 0, nextCursor: null }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listNotifications({ cursor: "next-page", limit: 20 })).resolves.toEqual({
      notifications: [],
      unreadCount: 0,
      nextCursor: null,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications?cursor=next-page&limit=20", {
      credentials: "include",
    });
  });

  it("marks a notification read", async () => {
    const notification = {
      id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
      type: "maintenance_due_soon",
      createdAt: "2026-07-02T14:00:00.000Z",
      readAt: "2026-07-02T15:00:00.000Z",
      asset: {
        id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
        name: "Ford F-150",
        type: "vehicle",
      },
      task: {
        id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        title: "Oil change",
        nextDue: "2026-07-04",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(notification), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(markNotificationRead(notification.id)).resolves.toEqual(notification);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/d5b3b826-2d77-494a-b99d-0d9fcf7c47c0/read",
      {
        method: "POST",
        credentials: "include",
      },
    );
  });

  it("marks all notifications read", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ unreadCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(markAllNotificationsRead()).resolves.toEqual({ unreadCount: 0 });

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
  });
});
