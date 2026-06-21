// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { searchAssets } from "../api/search";
import { AppSearch } from "./AppSearch";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../api/search", () => ({
  searchAssets: vi.fn(),
}));

const searchAssetsMock = vi.mocked(searchAssets);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderSearch(onClose = vi.fn()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<AppSearch open onClose={onClose} />);
  });

  return onClose;
}

async function enterSearchQuery(query: string) {
  const input = document.querySelector<HTMLInputElement>(".hfs-input");
  if (input === null) throw new Error("Search input was not rendered");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter === undefined) throw new Error("Search input does not have a value setter");

  await act(async () => {
    valueSetter.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function runDebouncedSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(280);
  });
}

describe("AppSearch", () => {
  it("closes and redirects to login when search returns 401", async () => {
    searchAssetsMock.mockRejectedValueOnce(new ApiError(401, { error: "Unauthorized" }));
    const onClose = await renderSearch();

    await enterSearchQuery("ram");
    await runDebouncedSearch();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("renders a retryable error state for other request failures", async () => {
    searchAssetsMock
      .mockRejectedValueOnce(new ApiError(500, { error: "Search service unavailable" }))
      .mockResolvedValueOnce({ results: [] });
    await renderSearch();

    await enterSearchQuery("ram");
    await runDebouncedSearch();

    expect(document.body.textContent).toContain("Search could not run");
    const retryButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Try again",
    );
    if (retryButton === undefined) throw new Error("Retry button was not rendered");

    await act(async () => {
      retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(280);
    });

    expect(searchAssetsMock).toHaveBeenCalledTimes(2);
  });
});
