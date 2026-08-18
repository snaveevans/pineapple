// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { editAsset, getAsset, type AssetResponse } from "../api/assets";
import { AppEditAsset } from "./AppEditAsset";

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
}));

vi.mock("../api/assets", () => ({
  getAsset: vi.fn(),
  editAsset: vi.fn(),
  assetQueryKey: (id: string) => ["asset", id],
  assetsQueryKey: ["assets"],
}));

const getAssetMock = vi.mocked(getAsset);
const editAssetMock = vi.mocked(editAsset);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

function vehicleAsset(overrides: Partial<AssetResponse> = {}): AssetResponse {
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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  getAssetMock.mockResolvedValue(vehicleAsset());
  editAssetMock.mockImplementation((_id, body) =>
    Promise.resolve(vehicleAsset({ name: body.name, metadata: body.metadata })),
  );
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

async function renderEditAsset() {
  if (queryClient === null) throw new Error("Query client was not initialized");
  const client = queryClient;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <AppEditAsset />
      </QueryClientProvider>,
    );
  });
  await waitFor(() => document.querySelector("h1") !== null);
}

function inputByPlaceholderOrValue(value: string): HTMLInputElement | null {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input")).find(
    (input) => input.value === value,
  ) ?? null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter === undefined) throw new Error("Input does not have a value setter");
  valueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonByText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === label,
  );
  if (button === undefined) throw new Error(`Button ${label} was not rendered`);
  return button;
}

async function click(label: string) {
  await act(async () => {
    buttonByText(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AppEditAsset", () => {
  it("prefills the form from the fetched asset", async () => {
    await renderEditAsset();

    expect(inputByPlaceholderOrValue("Truck")).not.toBeNull();
    expect(inputByPlaceholderOrValue("Ram")).not.toBeNull();
    expect(inputByPlaceholderOrValue("2500")).not.toBeNull();
    expect(document.body.textContent).toContain("Vehicle");
  });

  it("saves the edited name and metadata, then returns to the asset's detail page", async () => {
    await renderEditAsset();

    const nameInput = inputByPlaceholderOrValue("Truck");
    if (!nameInput) throw new Error("Name input not found");
    await act(async () => setInputValue(nameInput, "Work Truck"));

    await click("Save changes");

    expect(editAssetMock).toHaveBeenCalledWith("asset-1", {
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });
    expect(navigate).toHaveBeenCalledWith("/app/assets/asset-1/maintenance");
  });

  it("blocks submission and shows field errors when a required field is cleared", async () => {
    await renderEditAsset();

    const nameInput = inputByPlaceholderOrValue("Truck");
    if (!nameInput) throw new Error("Name input not found");
    await act(async () => setInputValue(nameInput, ""));

    await click("Save changes");

    expect(editAssetMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("1 field needs attention");
  });

  it("redirects to login on a 401 while loading the asset", async () => {
    getAssetMock.mockRejectedValue(new ApiError(401, { error: "Not authenticated" }));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    if (queryClient === null) throw new Error("Query client was not initialized");
    const client = queryClient;

    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <AppEditAsset />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => navigate.mock.calls.length > 0);

    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("shows access denied when the asset load is forbidden (403)", async () => {
    getAssetMock.mockRejectedValue(new ApiError(403, { error: "Forbidden" }));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    if (queryClient === null) throw new Error("Query client was not initialized");
    const client = queryClient;

    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <AppEditAsset />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => document.body.textContent?.includes("Access denied") ?? false);

    expect(document.body.textContent).not.toContain("Edit asset");
    expect(document.querySelector(".hf-input")).toBeNull();
  });

  it("shows asset not found when the asset load 404s", async () => {
    getAssetMock.mockRejectedValue(new ApiError(404, { error: "Not found" }));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    if (queryClient === null) throw new Error("Query client was not initialized");
    const client = queryClient;

    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <AppEditAsset />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => document.body.textContent?.includes("Asset not found") ?? false);

    expect(document.querySelector(".hf-input")).toBeNull();
  });

  it("shows access denied when the fetched asset's sharing.isOwner is false", async () => {
    getAssetMock.mockResolvedValue(
      vehicleAsset({ sharing: { scope: "team", isOwner: false, ownerDisplayName: "Pat" } }),
    );

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    if (queryClient === null) throw new Error("Query client was not initialized");
    const client = queryClient;

    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <AppEditAsset />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => document.body.textContent?.includes("Access denied") ?? false);

    expect(document.body.textContent).toContain("Only the asset's owner can edit it.");
    expect(document.querySelector(".hf-input")).toBeNull();
  });

  it("redirects to login on a 401 while saving", async () => {
    editAssetMock.mockRejectedValue(new ApiError(401, { error: "Not authenticated" }));
    await renderEditAsset();

    await click("Save changes");

    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("shows the server's error message on a non-401 save failure", async () => {
    editAssetMock.mockRejectedValue(new ApiError(500, { error: "Something broke" }));
    await renderEditAsset();

    await click("Save changes");

    expect(document.body.textContent).toContain("Asset could not be saved");
    expect(document.body.textContent).toContain("Something broke");
  });

  it("disables the save button and shows a busy label while the save is in flight", async () => {
    let resolveSave: (() => void) | null = null;
    editAssetMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = () => resolve(vehicleAsset());
        }),
    );
    await renderEditAsset();

    await act(async () => {
      buttonByText("Save changes").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saveButton = document.querySelector<HTMLButtonElement>(".hf-btn-primary.hf-btn-lg");
    expect(saveButton?.disabled).toBe(true);
    expect(saveButton?.textContent).toContain("Saving...");

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("cancel returns to the asset's detail page without saving", async () => {
    await renderEditAsset();

    await click("Cancel");

    expect(editAssetMock).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/app/assets/asset-1/maintenance");
  });
});
