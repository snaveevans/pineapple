// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserProfile, type UserProfile } from "../api/userProfile";
import { decideOAuthConsent, getOAuthClient } from "./authClient";
import { OAuthConsent } from "./OAuthConsent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

vi.mock("../api/userProfile", () => ({
  getUserProfile: vi.fn(),
}));

vi.mock("./authClient", () => ({
  decideOAuthConsent: vi.fn(),
  getOAuthClient: vi.fn(),
}));

const getUserProfileMock = vi.mocked(getUserProfile);
const getOAuthClientMock = vi.mocked(getOAuthClient);
const decideOAuthConsentMock = vi.mocked(decideOAuthConsent);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function profile(): UserProfile {
  return {
    email: "dale@fieldops-demo.com",
    name: "Dale Evans",
    onboardingCompletedAt: "2026-07-01T00:00:00.000Z",
    notificationEmail: null,
    notificationEmailVerified: false,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(
    {},
    "",
    "/oauth/consent?client_id=chatgpt&scope=assets%3Aread%20offline_access&sig=signed",
  );
  getUserProfileMock.mockResolvedValue(profile());
  getOAuthClientMock.mockResolvedValue({ name: "ChatGPT" });
  decideOAuthConsentMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.clearAllMocks();
});

async function renderConsent() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<OAuthConsent />);
  });
  await waitFor(() => document.body.textContent?.includes("ChatGPT wants to connect") === true);
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

function buttonByText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === label,
  );
  if (button === undefined) throw new Error(`Button ${label} was not rendered`);
  return button;
}

describe("OAuthConsent", () => {
  it("describes the narrow asset permission and address exclusion", async () => {
    await renderConsent();

    expect(document.body.textContent).toContain("View your active Pineapple assets");
    expect(document.body.textContent).toContain("Property addresses are never shared");
    expect(document.body.textContent).toContain("Stay connected until you disconnect");
    expect(getOAuthClientMock).toHaveBeenCalledWith("chatgpt");
    expect(getUserProfileMock).toHaveBeenCalledOnce();
  });

  it("grants the requested connection after the user allows it", async () => {
    await renderConsent();

    await act(async () => {
      buttonByText("Allow access").click();
    });

    expect(decideOAuthConsentMock).toHaveBeenCalledWith(true);
  });

  it("returns an OAuth denial when the user cancels", async () => {
    await renderConsent();

    await act(async () => {
      buttonByText("Cancel").click();
    });

    expect(decideOAuthConsentMock).toHaveBeenCalledWith(false);
  });

  it("fails closed when the signed authorization request has no client", async () => {
    window.history.replaceState({}, "", "/oauth/consent?scope=assets%3Aread&sig=signed");

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<OAuthConsent />);
    });

    expect(document.body.textContent).toContain("This connection request is invalid or expired");
    expect(getOAuthClientMock).not.toHaveBeenCalled();
    expect(decideOAuthConsentMock).not.toHaveBeenCalled();
  });
});
