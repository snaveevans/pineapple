// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { AppNotification, NotificationListResponse } from "../api/notifications";
import { AppNotifications } from "./AppNotifications";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();
const invalidateQueries = vi.fn();
const markReadMutate = vi.fn();
const markAllReadMutate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../design/hf.tsx", () => ({
  HFAssetIcon: ({
    asset,
  }: {
    asset: { category: AppNotification["asset"]["type"]; icon: string };
  }) => <span data-asset-icon={`${asset.category}:${asset.icon}`} />,
}));

vi.mock("./AppChrome", () => ({
  HFTopBar: () => <header />,
  HFBottomNav: () => <nav />,
}));

const useInfiniteQueryMock = vi.mocked(useInfiniteQuery);
const useMutationMock = vi.mocked(useMutation);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let notificationsQueryResult: unknown;

const notifications: AppNotification[] = [
  {
    id: "d5b3b826-2d77-494a-b99d-0d9fcf7c47c0",
    type: "maintenance_due_soon",
    createdAt: "2026-07-02T14:00:00.000Z",
    readAt: null,
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
  },
  {
    id: "3a80690d-df95-4128-8183-42776a6777db",
    type: "maintenance_due_soon",
    createdAt: "2026-07-01T18:05:00.000Z",
    readAt: "2026-07-01T19:00:00.000Z",
    asset: {
      id: "337f2d25-f1ab-4544-af2e-8196aa9d5a11",
      name: "Toro ZTR Mower",
      type: "equipment",
    },
    task: {
      id: "459b8627-012b-44f7-8ab1-8b0305bc106b",
      title: "Blade sharpen",
      nextDue: "2026-07-02",
    },
  },
];

function notificationPage(overrides: Partial<NotificationListResponse> = {}): NotificationListResponse {
  return {
    notifications,
    unreadCount: 1,
    nextCursor: null,
    ...overrides,
  };
}

function successfulNotificationsQuery(page = notificationPage()) {
  return {
    data: { pages: [page] },
    dataUpdatedAt: new Date("2026-07-02T22:00:00.000Z").getTime(),
    isPending: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-02T22:00:00.000Z"));
  notificationsQueryResult = successfulNotificationsQuery();
  useInfiniteQueryMock.mockImplementation(() => notificationsQueryResult as never);
  useMutationMock.mockImplementation((options) => {
    const mutationFn = options.mutationFn as { name?: string } | undefined;
    const mutate =
      mutationFn?.name === "markAllNotificationsRead" ? markAllReadMutate : markReadMutate;
    return {
      mutate,
      isPending: false,
      error: null,
    } as never;
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderNotifications() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<AppNotifications />);
  });
}

async function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === label,
  );
  if (button === undefined) throw new Error(`Button ${label} was not rendered`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("AppNotifications", () => {
  it("renders notification rows with unread count and due copy", async () => {
    await renderNotifications();

    expect(document.body.textContent).toContain("Notifications");
    expect(document.body.textContent).toContain("1 unread");
    expect(document.body.textContent).toContain("Oil change");
    expect(document.body.textContent).toContain("due in 2d");
    expect(document.body.textContent).toContain("Blade sharpen");
    expect(document.body.textContent).toContain("due today");
    expect(document.querySelector('[data-asset-icon="vehicle:truck"]')).not.toBeNull();
    expect(document.querySelector('[data-asset-icon="equipment:mower"]')).not.toBeNull();
  });

  it("marks one unread notification read when its row is clicked", async () => {
    await renderNotifications();
    const row = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Oil change due in 2d for Ford F-150"]',
    );
    if (row === null) throw new Error("Unread notification row was not rendered");

    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(markReadMutate).toHaveBeenCalledWith("d5b3b826-2d77-494a-b99d-0d9fcf7c47c0");
  });

  it("marks all notifications read from the header action", async () => {
    await renderNotifications();
    await clickButton("Mark all as read");

    expect(markAllReadMutate).toHaveBeenCalledTimes(1);
  });

  it("renders the empty inbox state", async () => {
    notificationsQueryResult = successfulNotificationsQuery(
      notificationPage({ notifications: [], unreadCount: 0 }),
    );

    await renderNotifications();

    expect(document.body.textContent).toContain("You're all caught up");
    expect(document.body.textContent).toContain("Maintenance reminders will show up here");
  });

  it("redirects 401 responses to sign in", async () => {
    notificationsQueryResult = {
      data: undefined,
      dataUpdatedAt: 0,
      isPending: false,
      isError: true,
      error: new ApiError(401, { error: "Unauthorized" }),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };

    await renderNotifications();

    expect(document.body.textContent).toContain("Redirecting to sign in");
    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});
