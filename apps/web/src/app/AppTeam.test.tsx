// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { AppTeam } from "./AppTeam";
import { validateTeamName, toTeamFormError } from "./teamForm";

declare global {
  var IS_REACT_ENVIRONMENT: boolean | undefined;
}

const navigate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
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
let queryResult: unknown;

function noTeamQueryResult() {
  return {
    data: { team: null },
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
  };
}

function teamQueryResult() {
  return {
    data: {
      team: {
        id: "aaa11100-0000-0000-0000-000000000001",
        name: "The Ortega Household",
        ownerId: "7d914909-c903-41a4-a13a-82cbd0f61851",
        members: [
          {
            userId: "7d914909-c903-41a4-a13a-82cbd0f61851",
            name: "Jamie Ortega",
            role: "owner",
          },
        ],
        createdAt: new Date().toISOString(),
      },
    },
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
  };
}

function errorQueryResult(status: number, message: string) {
  return {
    data: undefined,
    isLoading: false,
    isPending: false,
    isError: true,
    error: new ApiError(status, { error: message }),
  };
}

function loadingQueryResult() {
  return {
    data: undefined,
    isLoading: true,
    isPending: true,
    isError: false,
    error: null,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ENVIRONMENT = true;
  queryResult = noTeamQueryResult();
  useQueryMock.mockImplementation(() => queryResult as never);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  globalThis.IS_REACT_ENVIRONMENT = false;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderTeam() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<AppTeam />);
  });
}

async function setQueryResult(result: unknown) {
  queryResult = result;
  await act(async () => {
    root?.render(<AppTeam />);
  });
}

async function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (btn) => btn.textContent?.replace(/\s+/g, " ").trim() === label,
  );
  if (button === undefined) throw new Error(`Button "${label}" was not rendered`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("AppTeam", () => {
  it("shows the empty state when the user has no team", async () => {
    await renderTeam();
    expect(document.body.textContent).toContain("You don't have a team yet");
    expect(document.body.textContent).toContain("Create a team");
  });

  it("transitions to the create form when 'Create a team' is clicked", async () => {
    await renderTeam();
    await clickButton("Create a team");
    expect(document.getElementById("tm-name-input")).not.toBeNull();
    expect(document.body.textContent).toContain("Team details");
    expect(document.body.textContent).toContain("Invites and sharing come next");
  });

  it("returns to empty state when Cancel is clicked", async () => {
    await renderTeam();
    await clickButton("Create a team");
    await clickButton("Cancel");
    expect(document.body.textContent).toContain("You don't have a team yet");
    expect(document.getElementById("tm-name-input")).toBeNull();
  });

  it("shows the created state with team details when a team exists", async () => {
    await renderTeam();
    await setQueryResult(teamQueryResult());
    expect(document.body.textContent).toContain("Team created");
    expect(document.body.textContent).toContain("The Ortega Household");
    expect(document.body.textContent).toContain("Jamie Ortega (you)");
    expect(document.body.textContent).toContain("Owner");
  });

  it("shows the invite placeholder with 'Coming soon' badge", async () => {
    await renderTeam();
    await setQueryResult(teamQueryResult());
    expect(document.body.textContent).toContain("Invite a teammate");
    expect(document.body.textContent).toContain("Coming soon");
  });

  it("redirects to login on 401", async () => {
    queryResult = errorQueryResult(401, "Unauthorized");
    await renderTeam();
    expect(document.body.textContent).toContain("Redirecting to sign in");
    expect(navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("shows an error banner on non-401 errors", async () => {
    queryResult = errorQueryResult(500, "Server error");
    await renderTeam();
    expect(document.body.textContent).toContain("Could not load your team");
  });

  it("shows a loading state while the query is in flight", async () => {
    queryResult = loadingQueryResult();
    await renderTeam();
    expect(document.body.textContent).toContain("Loading");
  });
});

describe("validateTeamName", () => {
  it("rejects an empty name", () => {
    const result = validateTeamName("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("empty");
  });

  it("rejects a name over 100 characters", () => {
    const result = validateTeamName("x".repeat(101));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("too-long");
  });

  it("accepts a valid name and trims whitespace", () => {
    const result = validateTeamName("  Field Ops  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe("Field Ops");
  });

  it("accepts a name of exactly 100 characters", () => {
    const result = validateTeamName("x".repeat(100));
    expect(result.ok).toBe(true);
  });
});

describe("toTeamFormError", () => {
  it("maps a name field error to the empty type", () => {
    expect(toTeamFormError({ field: "name", message: "Team name is required." })).toBe("empty");
  });

  it("maps a too-long field error to the too-long type", () => {
    expect(
      toTeamFormError({ field: "name", message: "Team name must be 100 characters or fewer." }),
    ).toBe("too-long");
  });

  it("returns null for a non-name field error", () => {
    expect(toTeamFormError({ field: "other", message: "Something else" })).toBeNull();
  });
});
