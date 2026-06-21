// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ASSET_VIEW_STORAGE_KEY } from "./assetLibraryPresentation";
import { AppAssets } from "./AppAssets";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));

vi.mock("./AppChrome", () => ({
  HFTopBar: () => <header />,
  HFBottomNav: () => <nav />,
}));

const useQueryMock = vi.mocked(useQuery);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let assetsQueryResult: unknown;

function successfulAssetsQuery() {
  return {
    data: {
      assets: [
        {
          id: "195d0ef0-47f5-439f-abfd-29f892c9a040",
          name: "Truck",
          type: "vehicle",
          metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
          archivedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "337f2d25-f1ab-4544-af2e-8196aa9d5a11",
          name: "Generator",
          type: "equipment",
          metadata: { kind: "equipment", manufacturer: "Generac", modelNumber: "7043" },
          archivedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      counts: { all: 2, vehicle: 1, equipment: 1, property: 0 },
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  assetsQueryResult = successfulAssetsQuery();
  useQueryMock.mockImplementation(() => assetsQueryResult as never);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderAssets() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<AppAssets />);
  });
}

async function rerenderAssets() {
  await act(async () => {
    root?.render(<AppAssets />);
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

describe("AppAssets", () => {
  it("renders API counts and allows a zero-count category to enter the filtered-empty state", async () => {
    await renderAssets();

    expect(document.body.textContent).toContain("Properties0");

    await clickButton("Properties0");

    expect(document.body.textContent).toContain("No properties yet");
    expect(document.body.textContent).toContain("Clear filter");
  });

  it("switches to list view and persists the choice", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await renderAssets();
    expect(setItem).not.toHaveBeenCalledWith(ASSET_VIEW_STORAGE_KEY, "grid");
    const listButton = document.querySelector<HTMLButtonElement>('button[aria-label="List view"]');
    if (listButton === null) throw new Error("List view button was not rendered");

    await act(async () => {
      listButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.querySelector(".hf-assets-page")?.getAttribute("data-view")).toBe("list");
    expect(window.localStorage.getItem(ASSET_VIEW_STORAGE_KEY)).toBe("list");
    expect(setItem).toHaveBeenCalledWith(ASSET_VIEW_STORAGE_KEY, "list");
  });

  it("shows the specific request error and clears a filter before retrying", async () => {
    await renderAssets();
    await clickButton("Properties0");

    assetsQueryResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("Asset service is unavailable"),
      refetch: vi.fn(),
    };
    await rerenderAssets();

    expect(document.body.textContent).toContain("Asset service is unavailable");

    await clickButton("Try again");
    assetsQueryResult = successfulAssetsQuery();
    await rerenderAssets();

    expect(document.body.textContent).toContain("Truck");
    expect(document.body.textContent).not.toContain("No properties yet");
  });

  it("renders a redirect status instead of blank content for 401 responses", async () => {
    assetsQueryResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError(401, { error: "Unauthorized" }),
      refetch: vi.fn(),
    };

    await renderAssets();

    expect(document.body.textContent).toContain("Redirecting to sign in");
    expect(document.body.textContent).not.toContain("Try again");
    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});
