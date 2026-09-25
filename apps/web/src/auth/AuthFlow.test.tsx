// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserProfile, type UserProfile } from "../api/userProfile";
import { getOAuthClient, startGoogleSignIn } from "./authClient";
import { AuthFlow } from "./AuthFlow";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();
let currentSearch = new URLSearchParams();

vi.mock("react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useSearchParams: () => [currentSearch, vi.fn()],
}));

vi.mock("../api/userProfile", () => ({
  getUserProfile: vi.fn(),
  isOnboardingComplete: (profile: UserProfile) => profile.onboardingCompletedAt !== null,
}));

vi.mock("./authClient", () => ({
  getOAuthClient: vi.fn(),
  startGoogleSignIn: vi.fn(),
}));

const getUserProfileMock = vi.mocked(getUserProfile);
const getOAuthClientMock = vi.mocked(getOAuthClient);
const startGoogleSignInMock = vi.mocked(startGoogleSignIn);

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
  currentSearch = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { email: "dale@fieldops-demo.com" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  getUserProfileMock.mockResolvedValue(profile());
  getOAuthClientMock.mockResolvedValue({ name: "ChatGPT" });
  startGoogleSignInMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderAuthFlow() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<AuthFlow />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonByText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === label,
  );
  if (button === undefined) throw new Error(`Button ${label} was not rendered`);
  return button;
}

describe("AuthFlow MCP authorization continuation", () => {
  it("does not send an existing session away from a signed authorization request", async () => {
    currentSearch = new URLSearchParams("client_id=chatgpt&sig=signed");

    await renderAuthFlow();

    expect(navigate).not.toHaveBeenCalled();
    expect(getOAuthClientMock).toHaveBeenCalledWith("chatgpt");
    expect(getUserProfileMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Continue with Google");
  });

  it("starts Google sign-in through the OAuth-aware client", async () => {
    currentSearch = new URLSearchParams("client_id=chatgpt&sig=signed");
    await renderAuthFlow();

    await act(async () => {
      buttonByText("Continue with Google").click();
    });

    expect(startGoogleSignInMock).toHaveBeenCalledOnce();
  });

  it("keeps the normal signed-in navigation behavior outside an authorization request", async () => {
    await renderAuthFlow();

    expect(getOAuthClientMock).not.toHaveBeenCalled();
    expect(getUserProfileMock).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/app", { replace: true });
  });

  it("does not strand an existing session on a forged authorization request", async () => {
    currentSearch = new URLSearchParams("client_id=chatgpt&sig=forged");
    getOAuthClientMock.mockRejectedValue(new Error("invalid_signature"));

    await renderAuthFlow();

    expect(getOAuthClientMock).toHaveBeenCalledWith("chatgpt");
    expect(getUserProfileMock).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/app", { replace: true });
  });

  it("does not strand an existing session on a bare signature parameter", async () => {
    currentSearch = new URLSearchParams("sig=");

    await renderAuthFlow();

    expect(getOAuthClientMock).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/app", { replace: true });
  });
});
