// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import { getAsset, type AssetResponse } from "../api/assets.ts";
import {
  listMaintenanceRecords,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  type MaintenanceRecord,
} from "../api/maintenanceRecords.ts";
import { listMaintenanceTasks } from "../api/maintenanceTasks.ts";
import { AppMaintenanceRecords } from "./AppMaintenanceRecords.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useParams: () => ({ assetId: "asset-1" }),
}));

vi.mock("./AppChrome", () => ({
  HFTopBar: () => <header />,
  HFBottomNav: () => <nav />,
}));

vi.mock("../api/assets.ts", () => ({
  getAsset: vi.fn(),
  shareAsset: vi.fn(),
  unshareAsset: vi.fn(),
  assetQueryKey: (id: string) => ["asset", id],
  assetsQueryKey: ["assets"],
}));

vi.mock("../api/maintenanceRecords.ts", () => ({
  listMaintenanceRecords: vi.fn(),
  createMaintenanceRecord: vi.fn(),
  updateMaintenanceRecord: vi.fn(),
  deleteMaintenanceRecord: vi.fn(),
  maintenanceRecordsQueryKey: (id: string) => ["maintenanceRecords", id],
}));

vi.mock("../api/maintenanceTasks.ts", () => ({
  listMaintenanceTasks: vi.fn(),
  createMaintenanceTask: vi.fn(),
  updateMaintenanceTask: vi.fn(),
  deleteMaintenanceTask: vi.fn(),
  maintenanceTasksQueryKey: (id: string) => ["maintenanceTasks", id],
}));

vi.mock("../api/dashboard.ts", () => ({
  getDashboard: vi.fn().mockResolvedValue({ todayUtc: "2026-06-09" }),
  dashboardQueryKey: ["dashboard"],
}));

vi.mock("../api/teams.ts", () => ({
  getMyTeam: vi.fn().mockResolvedValue({ team: null }),
  teamQueryKey: ["myTeam"],
}));

const getAssetMock = vi.mocked(getAsset);
const listMaintenanceRecordsMock = vi.mocked(listMaintenanceRecords);
const updateMaintenanceRecordMock = vi.mocked(updateMaintenanceRecord);
const deleteMaintenanceRecordMock = vi.mocked(deleteMaintenanceRecord);
const listMaintenanceTasksMock = vi.mocked(listMaintenanceTasks);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

function mockAsset(overrides: Partial<AssetResponse> = {}): AssetResponse {
  return {
    id: "asset-1",
    name: "Truck",
    type: "vehicle",
    metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sharing: { scope: "personal", isOwner: true },
    ...overrides,
  };
}

function mockRecord(overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  return {
    id: "rec-1",
    assetId: "asset-1",
    title: "Oil change",
    performedAt: "2026-05-01",
    notes: "5W-30 synthetic",
    taskId: null,
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  getAssetMock.mockResolvedValue(mockAsset());
  listMaintenanceRecordsMock.mockResolvedValue({
    maintenanceRecords: [mockRecord()],
  });
  listMaintenanceTasksMock.mockResolvedValue({
    maintenanceTasks: [],
  });
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

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (assertion()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  if (!assertion()) throw new Error("Timed out waiting for expected UI");
}

async function renderApp() {
  if (queryClient === null) throw new Error("Query client was not initialized");
  const client = queryClient;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <AppMaintenanceRecords />
      </QueryClientProvider>,
    );
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter === undefined) throw new Error("Input does not have a value setter");
  valueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("AppMaintenanceRecords edit and delete", () => {
  it("renders maintenance record action buttons on active assets", async () => {
    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".mr-tab")));

    // Switch to Maintenance tab
    const tabs = container?.querySelectorAll<HTMLButtonElement>(".mr-tab");
    const maintTab = Array.from(tabs ?? []).find((t) => t.textContent?.includes("Maintenance"));
    await act(async () => {
      maintTab?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-record-actions")));
    expect(container?.querySelector(".mr-record-edit-btn")).not.toBeNull();
    expect(container?.querySelector(".mr-record-del-btn")).not.toBeNull();
  });

  it("hides maintenance record action buttons on archived assets", async () => {
    getAssetMock.mockResolvedValue(mockAsset({ archivedAt: "2026-06-01T00:00:00.000Z" }));
    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".mr-tab")));

    // Switch to Maintenance tab
    const tabs = container?.querySelectorAll<HTMLButtonElement>(".mr-tab");
    const maintTab = Array.from(tabs ?? []).find((t) => t.textContent?.includes("Maintenance"));
    await act(async () => {
      maintTab?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-tl-title")));
    expect(container?.querySelector(".mr-record-actions")).toBeNull();
    expect(container?.querySelector(".mr-hero-add")).toBeNull();
  });

  it("opens edit form, pre-fills record values, and updates record successfully", async () => {
    updateMaintenanceRecordMock.mockResolvedValue(mockRecord({ title: "Updated Oil Change" }));

    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".mr-tab")));

    const tabs = container?.querySelectorAll<HTMLButtonElement>(".mr-tab");
    const maintTab = Array.from(tabs ?? []).find((t) => t.textContent?.includes("Maintenance"));
    await act(async () => {
      maintTab?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-record-edit-btn")));
    const editBtn = container?.querySelector<HTMLButtonElement>(".mr-record-edit-btn");
    await act(async () => {
      editBtn?.click();
    });

    await waitFor(() => Boolean(container?.querySelector("#mre-title")));
    const titleInput = container?.querySelector<HTMLInputElement>("#mre-title");
    expect(titleInput?.value).toBe("Oil change");

    await act(async () => {
      if (titleInput) {
        setInputValue(titleInput, "Updated Oil Change");
      }
    });

    const submitBtn = container?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      submitBtn?.click();
    });

    expect(updateMaintenanceRecordMock).toHaveBeenCalledWith("asset-1", "rec-1", {
      title: "Updated Oil Change",
      performedAt: "2026-05-01",
      notes: "5W-30 synthetic",
    });
  });

  it("opens delete confirmation modal and deletes record", async () => {
    deleteMaintenanceRecordMock.mockResolvedValue();

    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".mr-tab")));

    const tabs = container?.querySelectorAll<HTMLButtonElement>(".mr-tab");
    const maintTab = Array.from(tabs ?? []).find((t) => t.textContent?.includes("Maintenance"));
    await act(async () => {
      maintTab?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-record-del-btn")));
    const delBtn = container?.querySelector<HTMLButtonElement>(".mr-record-del-btn");
    await act(async () => {
      delBtn?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-confirm-dialog")));
    expect(container?.querySelector(".mr-confirm-dialog-title")?.textContent).toContain(
      "Delete maintenance record?",
    );

    const confirmDeleteBtn = container?.querySelector<HTMLButtonElement>(".mr-task-confirm-yes");
    await act(async () => {
      confirmDeleteBtn?.click();
    });

    expect(deleteMaintenanceRecordMock).toHaveBeenCalledWith("asset-1", "rec-1");
  });

  it("handles 503 frozen write error when updating", async () => {
    updateMaintenanceRecordMock.mockRejectedValue(new ApiError(503, { error: "Changes paused" }));

    await renderApp();
    await waitFor(() => Boolean(container?.querySelector(".mr-tab")));

    const tabs = container?.querySelectorAll<HTMLButtonElement>(".mr-tab");
    const maintTab = Array.from(tabs ?? []).find((t) => t.textContent?.includes("Maintenance"));
    await act(async () => {
      maintTab?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-record-edit-btn")));
    const editBtn = container?.querySelector<HTMLButtonElement>(".mr-record-edit-btn");
    await act(async () => {
      editBtn?.click();
    });

    await waitFor(() => Boolean(container?.querySelector("#mre-title")));
    const submitBtn = container?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      submitBtn?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".mr-banner")));
    expect(container?.querySelector(".mr-banner")?.textContent).toContain(
      "Maintenance changes are temporarily paused",
    );
  });
});
