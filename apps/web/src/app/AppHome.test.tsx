// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ApiError } from "../api/client.ts";
import { getDashboard, type DashboardResponse } from "../api/dashboard.ts";
import { rescheduleMaintenanceTask, type MaintenanceTask } from "../api/maintenanceTasks.ts";
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
  rescheduleMaintenanceTask: vi.fn(),
}));

vi.mock("./AddServiceModal.tsx", () => ({
  AddServiceModal: () => <div data-testid="add-service-modal" />,
}));

const getDashboardMock = vi.mocked(getDashboard);
const rescheduleMock = vi.mocked(rescheduleMaintenanceTask);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;
let invalidateSpy: MockInstance<QueryClient["invalidateQueries"]> | null = null;

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

function rescheduledTask(): MaintenanceTask {
  return {
    id: "task-1",
    assetId: "asset-1",
    title: "Replace furnace filter",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-04-12",
    nextDue: "2026-09-15",
    status: "ok",
    daysDue: 98,
    createdAt: "2026-04-12T12:00:00.000Z",
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
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
  invalidateSpy?.mockRestore();
  invalidateSpy = null;
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

function rescheduleButton(): HTMLButtonElement | undefined {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>(".hf-actions button") ?? [],
  ).find((b) => b.textContent?.includes("Reschedule"));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter === undefined) throw new Error("Input does not have a value setter");
  valueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function openModalAndPickDate(date: string) {
  await waitFor(() => Boolean(container?.querySelector(".hf-detail-card")));

  const button = rescheduleButton();
  expect(button?.disabled).toBe(false);
  await act(async () => {
    button?.click();
  });

  await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));
  const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
  await act(async () => {
    if (input) setInputValue(input, date);
  });
}

function submitModal() {
  const buttons = container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button") ?? [];
  const submit = Array.from(buttons).find((b) => b.textContent?.includes("Reschedule"));
  return act(async () => {
    submit?.click();
  });
}

describe("AppHome reschedule action", () => {
  it("renders the reschedule action enabled and opens the future-date form", async () => {
    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".hf-detail-card")));

    expect(rescheduleButton()?.disabled).toBe(false);
    await act(async () => {
      rescheduleButton()?.click();
    });

    await waitFor(() =>
      Boolean(container?.querySelector('[role="dialog"][aria-label="Reschedule task"]')),
    );
  });

  it("still disables snooze as a placeholder", async () => {
    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".hf-detail-card")));

    const snooze = Array.from(
      container?.querySelectorAll<HTMLButtonElement>(".hf-actions button") ?? [],
    ).find((b) => b.textContent?.includes("Snooze"));
    expect(snooze?.disabled).toBe(true);
  });

  it("on success invalidates the dashboard read model and the asset's task list", async () => {
    rescheduleMock.mockResolvedValue(rescheduledTask());
    await renderApp();
    invalidateSpy?.mockClear();
    await openModalAndPickDate("2026-09-15");
    await submitModal();

    expect(rescheduleMock).toHaveBeenCalledWith("asset-1", "task-1", { nextDue: "2026-09-15" });

    await waitFor(() => {
      const queryKeys = invalidateSpy?.mock.calls.map(
        (call) => (call[0] as { queryKey?: readonly unknown[] })?.queryKey,
      );
      return (
        (queryKeys?.some((key) => Array.isArray(key) && key[0] === "dashboard") ?? false) &&
        (queryKeys?.some((key) => Array.isArray(key) && key[0] === "maintenanceTasks") ?? false)
      );
    });

    // The success path invalidates both read models the queue and task list
    // render from.
    const firstKeys = invalidateSpy?.mock.calls.map((call) => call[0]) ?? [];
    expect(firstKeys).toContainEqual({ queryKey: ["dashboard"] });
    expect(firstKeys).toContainEqual({ queryKey: ["maintenanceTasks", "asset-1"] });

    // The modal closes after the save settles.
    await waitFor(() => container?.querySelector("#hf-resched-date") === null);
  });

  it("on 403/404/503 keeps the current dashboard data visible and offers retry", async () => {
    rescheduleMock.mockRejectedValue(
      new ApiError(403, { error: "The task's asset belongs to another user" }),
    );
    await renderApp();
    await openModalAndPickDate("2026-09-15");
    invalidateSpy?.mockClear();
    await submitModal();

    await waitFor(() => Boolean(container?.querySelector(".hf-svc-banner")));
    expect(container?.querySelector(".hf-svc-banner")?.textContent).toContain(
      "belongs to another user",
    );

    // Current dashboard data is intact: the queue still shows the task and the
    // selected detail still renders it.
    expect(container?.textContent).toContain("Replace furnace filter");
    expect(container?.querySelector(".hf-queue-list")).not.toBeNull();
    // Nothing was invalidated: the visible data was not thrown away.
    expect(invalidateSpy).not.toHaveBeenCalled();

    // The submitting action is re-enabled so the user can retry.
    await waitFor(() => {
      const submit = Array.from(
        container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button") ?? [],
      ).find((b) => b.textContent?.includes("Reschedule"));
      return submit?.disabled === false;
    });
  });
});
