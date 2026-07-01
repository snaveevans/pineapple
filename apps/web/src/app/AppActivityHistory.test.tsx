// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry, ActivityResponse } from "../api/activity";
import { AppActivityHistory } from "./AppActivityHistory";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: vi.fn(),
}));

vi.mock("react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));

vi.mock("../design/hf.tsx", () => ({
  HFAssetIcon: ({
    asset,
  }: {
    asset: { category: ActivityEntry["asset"]["type"]; icon: string };
  }) => <span data-asset-icon={`${asset.category}:${asset.icon}`} />,
}));

vi.mock("./AppChrome", () => ({
  HFTopBar: () => <header />,
  HFBottomNav: () => <nav />,
}));

const useInfiniteQueryMock = vi.mocked(useInfiniteQuery);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let activityQueryResult: unknown;

const entries: ActivityEntry[] = [
  {
    id: "f60feab8-48df-4947-ae58-6ef7257531da",
    type: "task_scheduled",
    occurredAt: "2026-07-01T10:00:00.000Z",
    asset: {
      id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
      name: "Sprinter Van",
      type: "vehicle",
    },
    title: "Cabin filter",
  },
  {
    id: "5a82e4fc-f71e-4efd-9b2e-db42c422c594",
    type: "maintenance_logged",
    occurredAt: "2026-06-30T10:00:00.000Z",
    asset: {
      id: "337f2d25-f1ab-4544-af2e-8196aa9d5a11",
      name: "Generac Generator",
      type: "equipment",
    },
    title: "Oil change",
    performedAt: "2026-06-30",
  },
];

function activityPage(): ActivityResponse {
  return {
    entries,
    availableFilters: {
      types: [
        { type: "task_scheduled", count: 1 },
        { type: "maintenance_logged", count: 1 },
      ],
      assets: [
        { asset: entries[0]!.asset, count: 1 },
        { asset: entries[1]!.asset, count: 1 },
      ],
    },
    nextCursor: null,
  };
}

function successfulActivityQuery() {
  return {
    data: { pages: [activityPage()] },
    dataUpdatedAt: new Date("2026-07-01T12:00:00.000Z").getTime(),
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
  vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  activityQueryResult = successfulActivityQuery();
  useInfiniteQueryMock.mockImplementation(() => activityQueryResult as never);
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
  vi.clearAllMocks();
});

async function renderHistory() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<AppActivityHistory />);
  });
}

async function enterSearchQuery(query: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]');
  if (input === null) throw new Error("History search input was not rendered");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter === undefined) throw new Error("Search input does not have a value setter");

  await act(async () => {
    valueSetter.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AppActivityHistory", () => {
  it("renders the real timeline grouped by UTC day", async () => {
    await renderHistory();

    expect(document.body.textContent).toContain("Today");
    expect(document.body.textContent).toContain("Yesterday");
    expect(document.body.textContent).toContain("Cabin filter");
    expect(document.body.textContent).toContain("Oil change");
  });

  it("filters only the loaded history entries by search text", async () => {
    await renderHistory();

    await enterSearchQuery("oil");

    expect(document.body.textContent).toContain("Oil change");
    expect(document.body.textContent).not.toContain("Cabin filter");
  });

  it("uses domain-specific asset icons for rendered history entries", async () => {
    await renderHistory();

    expect(document.querySelector('[data-asset-icon="vehicle:van"]')).not.toBeNull();
    expect(document.querySelector('[data-asset-icon="equipment:bolt"]')).not.toBeNull();
  });
});
