// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import {
  rescheduleMaintenanceTask,
  type MaintenanceTask,
} from "../api/maintenanceTasks.ts";
import { RescheduleTaskModal } from "./RescheduleTaskModal.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../api/maintenanceTasks.ts", () => ({
  rescheduleMaintenanceTask: vi.fn(),
}));

const rescheduleMock = vi.mocked(rescheduleMaintenanceTask);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

const TODAY_UTC = "2026-06-09";

function mockTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: "task-1",
    assetId: "asset-1",
    title: "Replace furnace filter",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-05-11",
    nextDue: "2026-09-15",
    status: "ok",
    daysDue: 98,
    createdAt: "2026-05-11T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

async function renderModal(props: {
  onSaved?: (task: MaintenanceTask) => void | Promise<void>;
  onClose?: () => void;
}) {
  if (queryClient === null) throw new Error("Query client was not initialized");
  const client = queryClient;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <RescheduleTaskModal
          taskId="task-1"
          assetId="asset-1"
          taskTitle="Replace furnace filter"
          currentNextDue="2026-07-11"
          todayUtc={TODAY_UTC}
          onClose={props.onClose ?? (() => {})}
          onSaved={props.onSaved ?? (() => {})}
        />
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

describe("RescheduleTaskModal", () => {
  it("renders the future-date form with a min date strictly after today", async () => {
    await renderModal({});
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
    expect(input?.min).toBe("2026-06-10");
    expect(container?.textContent).toContain("Replace furnace filter");
  });

  it("submits the reschedule endpoint and calls onSaved with the returned task", async () => {
    const onSaved = vi.fn();
    rescheduleMock.mockResolvedValue(mockTask());
    await renderModal({ onSaved });
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
    await act(async () => {
      if (input) setInputValue(input, "2026-09-15");
    });

    const buttons = container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button");
    const submit = Array.from(buttons ?? []).find((b) => b.textContent?.includes("Reschedule"));
    await act(async () => {
      submit?.click();
    });

    expect(rescheduleMock).toHaveBeenCalledWith("asset-1", "task-1", { nextDue: "2026-09-15" });
    await waitFor(() => Boolean(container?.querySelector(".hf-svc-done")));
    await waitFor(() => onSaved.mock.calls.length > 0);
    expect(onSaved).toHaveBeenCalledWith(mockTask());
    // No maintenance record is created — the copy says so explicitly.
    expect(container?.textContent).toContain("No maintenance was logged");
  });

  it("rejects a past or today target client-side without calling the API", async () => {
    await renderModal({});
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
    await act(async () => {
      if (input) setInputValue(input, TODAY_UTC);
    });

    const buttons = container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button");
    const submit = Array.from(buttons ?? []).find((b) => b.textContent?.includes("Reschedule"));
    await act(async () => {
      submit?.click();
    });

    expect(rescheduleMock).not.toHaveBeenCalled();
    await waitFor(() => Boolean(container?.querySelector(".hf-field-error")));
    expect(container?.querySelector(".hf-field-error")?.textContent).toContain(
      "must be after today",
    );
  });

  it("shows the server 422 error on the date field", async () => {
    rescheduleMock.mockRejectedValue(
      new ApiError(422, { error: "Next due date must be after today", field: "nextDue" }),
    );
    await renderModal({});
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
    await act(async () => {
      if (input) setInputValue(input, "2026-09-15");
    });

    const buttons = container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button");
    const submit = Array.from(buttons ?? []).find((b) => b.textContent?.includes("Reschedule"));
    await act(async () => {
      submit?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".hf-field-error")));
    expect(container?.querySelector(".hf-field-error")?.textContent).toContain(
      "Next due date must be after today",
    );
    // The form stays open with the current due-date hint intact.
    expect(container?.querySelector("#hf-resched-date")).not.toBeNull();
  });

  it("shows the 403/404/503 error as a banner and keeps current data visible", async () => {
    rescheduleMock.mockRejectedValue(
      new ApiError(503, { error: "Changes are temporarily paused" }),
    );
    await renderModal({});
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
    await act(async () => {
      if (input) setInputValue(input, "2026-09-15");
    });

    const buttons = container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button");
    const submit = Array.from(buttons ?? []).find((b) => b.textContent?.includes("Reschedule"));
    await act(async () => {
      submit?.click();
    });

    await waitFor(() => Boolean(container?.querySelector(".hf-svc-banner")));
    expect(container?.querySelector(".hf-svc-banner")?.textContent).toContain(
      "Changes are temporarily paused",
    );
    // The form remains open with the entered data intact.
    expect(container?.querySelector<HTMLInputElement>("#hf-resched-date")?.value).toBe(
      "2026-09-15",
    );
  });

  it("shows a pending state on the submitting action while the request is in flight", async () => {
    let resolveRequest: ((task: MaintenanceTask) => void) | undefined;
    rescheduleMock.mockImplementation(
      () =>
        new Promise<MaintenanceTask>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    await renderModal({});
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const input = container?.querySelector<HTMLInputElement>("#hf-resched-date");
    await act(async () => {
      if (input) setInputValue(input, "2026-09-15");
    });

    const buttons = container?.querySelectorAll<HTMLButtonElement>(".hf-svc-foot button");
    const submit = Array.from(buttons ?? []).find((b) => b.textContent?.includes("Reschedule"));
    await act(async () => {
      submit?.click();
    });

    await waitFor(() => Boolean(container?.textContent?.includes("Saving…")));
    expect(submit?.disabled).toBe(true);
    // Only the submitting action is disabled; Cancel remains enabled.
    const cancel = Array.from(buttons ?? []).find((b) => b.textContent?.includes("Cancel"));
    expect(cancel?.disabled).toBe(false);

    await act(async () => {
      resolveRequest?.(mockTask());
    });
    await waitFor(() => Boolean(container?.querySelector(".hf-svc-done")));
  });

  it("calls onClose from the close button", async () => {
    const onClose = vi.fn();
    await renderModal({ onClose });
    await waitFor(() => Boolean(container?.querySelector("#hf-resched-date")));

    const close = container?.querySelector<HTMLButtonElement>('.hf-icon-btn[aria-label="Close"]');
    await act(async () => {
      close?.click();
    });
    expect(onClose).toHaveBeenCalled();
  });
});
