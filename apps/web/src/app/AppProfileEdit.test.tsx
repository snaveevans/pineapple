// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import {
  getUserProfile,
  removeNotificationEmail,
  requestEmailVerification,
  setNotificationEmail,
  updateUserProfile,
  type UserProfile,
} from "../api/userProfile";
import { AppProfileEdit } from "./AppProfileEdit";

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
}));

vi.mock("./AppChrome", () => ({
  HFTopBar: () => <header />,
  HFBottomNav: () => <nav />,
}));

vi.mock("../api/userProfile", () => ({
  getUserProfile: vi.fn(),
  removeNotificationEmail: vi.fn(),
  requestEmailVerification: vi.fn(),
  setNotificationEmail: vi.fn(),
  updateUserProfile: vi.fn(),
  userProfileQueryKey: ["userProfile"],
}));

const getUserProfileMock = vi.mocked(getUserProfile);
const removeNotificationEmailMock = vi.mocked(removeNotificationEmail);
const requestEmailVerificationMock = vi.mocked(requestEmailVerification);
const setNotificationEmailMock = vi.mocked(setNotificationEmail);
const updateUserProfileMock = vi.mocked(updateUserProfile);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let queryClient: QueryClient | null = null;

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    email: "dale@fieldops-demo.com",
    name: "Dale Evans",
    onboardingCompletedAt: "2026-07-01T00:00:00.000Z",
    notificationEmail: null,
    notificationEmailVerified: false,
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  getUserProfileMock.mockResolvedValue(profile());
  updateUserProfileMock.mockImplementation((name) => Promise.resolve(profile({ name })));
  setNotificationEmailMock.mockImplementation((email) =>
    Promise.resolve(profile({ notificationEmail: email, notificationEmailVerified: false })),
  );
  removeNotificationEmailMock.mockResolvedValue(profile());
  requestEmailVerificationMock.mockResolvedValue({ status: "accepted" });
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

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderProfileEdit() {
  if (queryClient === null) throw new Error("Query client was not initialized");
  const client = queryClient;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <AppProfileEdit />
      </QueryClientProvider>,
    );
  });
  await waitFor(() => document.querySelector("#pe-email-input") !== null);
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

async function typeEmail(value: string) {
  const input = document.querySelector<HTMLInputElement>("#pe-email-input");
  if (input === null) throw new Error("Contact email input was not rendered");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter === undefined) throw new Error("Email input does not have a value setter");

  await act(async () => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressEnterInEmail() {
  const input = document.querySelector<HTMLInputElement>("#pe-email-input");
  if (input === null) throw new Error("Contact email input was not rendered");

  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  });
  await flushAsync();
}

async function click(label: string) {
  await act(async () => {
    buttonByText(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushAsync();
}

async function clickByLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (button === null) throw new Error(`Button ${label} was not rendered`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushAsync();
}

describe("AppProfileEdit contact email", () => {
  it("validates the contact email before saving", async () => {
    await renderProfileEdit();

    await typeEmail("not-an-email");
    await click("Save");

    expect(setNotificationEmailMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("A valid email address is required.");
  });

  it("saves a new contact email and shows the verification state", async () => {
    await renderProfileEdit();

    await typeEmail("dale@homemail.com");
    await click("Save");

    expect(setNotificationEmailMock).toHaveBeenCalledWith("dale@homemail.com");
    expect(document.body.textContent).toContain("Unverified");
    expect(document.body.textContent).toContain(
      "Verification email sent to dale@homemail.com; check your inbox.",
    );
  });

  it("saves the contact email instead of the display name when pressing enter in the email field", async () => {
    await renderProfileEdit();

    await typeEmail("dale@homemail.com");
    await pressEnterInEmail();

    expect(setNotificationEmailMock).toHaveBeenCalledWith("dale@homemail.com");
    expect(updateUserProfileMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Verification email sent to dale@homemail.com; check your inbox.",
    );
  });

  it("removes an existing contact email", async () => {
    getUserProfileMock.mockResolvedValue(
      profile({ notificationEmail: "dale@homemail.com", notificationEmailVerified: true }),
    );

    await renderProfileEdit();
    await clickByLabel("Remove contact email");

    expect(removeNotificationEmailMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "Contact email removed. Maintenance reminders will not be sent until you add one.",
    );
  });

  it("resends verification for an unverified contact email", async () => {
    getUserProfileMock.mockResolvedValue(
      profile({ notificationEmail: "dale@homemail.com", notificationEmailVerified: false }),
    );

    await renderProfileEdit();
    await click("Resend verification email");

    expect(requestEmailVerificationMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "Verification email sent to dale@homemail.com; check your inbox.",
    );
  });

  it("shows cooldown feedback when verification resend is rate-limited", async () => {
    getUserProfileMock.mockResolvedValue(
      profile({ notificationEmail: "dale@homemail.com", notificationEmailVerified: false }),
    );
    requestEmailVerificationMock.mockRejectedValueOnce(
      new ApiError(429, { error: "Verification email requested too frequently" }),
    );

    await renderProfileEdit();
    await click("Resend verification email");

    expect(requestEmailVerificationMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "You can request another verification email in a few minutes.",
    );
    expect(buttonByText("Resend verification email").disabled).toBe(true);
  });
});
