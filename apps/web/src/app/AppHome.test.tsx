// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboard, type DashboardResponse } from "../api/dashboard.ts";
import { AppHome } from "./AppHome.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./AppChrome", () => ({
  HFTopBar: () => <header />,
  HFBottomNav: () => <nav />,
}));

vi.mock("../api/dashboard.ts", () => ({
  getDashboard: vi.fn(),
  dashboardQueryKey: ["dashboard"],
}));

vi.mock("../api/assets.ts", () => ({
  listAssets: vi.fn().mockResolvedValue({ assets: [] }),
  assetsQueryKey: ["assets"],
}));

vi.mock("../api/maintenanceRecords.ts", () => ({
  createMaintenanceRecord: vi.fn(),
  maintenanceRecordsQueryKey: (id: string) => ["maintenanceRecords", id],
}));

vi.mock("../api/maintenanceTasks.ts", () => ({
  maintenanceTasksQueryKey: (id: string) => ["maintenanceTasks", id],
}));

vi.mock("./AddServiceModal.tsx", () => ({
  AddServiceModal: () => <div data-testid="add-service-modal" />,
}));

vi.mock("./RescheduleTaskModal.tsx", () => ({
  RescheduleTaskModal: () => <div data-testid="reschedule-task-modal" />,
}));

const getDashboardMock = vi.mocked(getDashboard);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

const dashboard: DashboardResponse = {
  viewerDisplayName: "Dale",
  todayUtc: "2026-06-09",
  fleetTotals: { total: 1, vehicle: 1, equipment: 0, property: 0 },
  fleetHealth: { overdue: 0, soon: 1, onTrack: 0, unscheduled: 0 },
  queueCountsByCategory: { all: 1, vehicle: 1, equipment: 0, property: 0 },
  queue: [
    {
      taskId: "task-1",
      taskTitle: "Replace furnace filter",
      nextDue: "2026-06-12",
      daysDue: 3,
      status: "soon",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-04-12",
      createdAt: "2026-04-12T12:00:00.000Z",
      assetId: "asset-1",
      assetName: "Truck",
      assetType: "vehicle",
      sharing: { scope: "personal", isOwner: true },
    },
  ],
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  getDashboardMock.mockResolvedValue(dashboard);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  queryClient?.clear();
  queryClient = null;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.clearAllMocks();
});

async function renderApp() {
  if (queryClient === null) throw new Error("Query client was not initialized");
  const client = queryClient;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <AppHome />
      </QueryClientProvider>,
    );
  });
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (assertion()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  if (!assertion()) throw new Error("Timed out waiting for expected UI");
}

describe("AppHome reschedule action", () => {
  it("renders the reschedule action enabled and opens the future-date form", async () => {
    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".hf-detail-card")));

    const button = Array.from(
      container?.querySelectorAll<HTMLButtonElement>(".hf-actions button") ?? [],
    ).find((b) => b.textContent?.includes("Reschedule"));
    expect(button).toBeDefined();
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
    });

    await waitFor(() => Boolean(container?.querySelector('[data-testid="reschedule-task-modal"]')));
  });

  it("still disables snooze as a placeholder", async () => {
    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".hf-detail-card")));

    const snooze = Array.from(
      container?.querySelectorAll<HTMLButtonElement>(".hf-actions button") ?? [],
    ).find((b) => b.textContent?.includes("Snooze"));
    expect(snooze?.disabled).toBe(true);
  });
});
