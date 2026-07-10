// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useQuery } from "@tanstack/react-query";
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
        name: "Field Ops",
        ownerId: "7d914909-c903-41a4-a13a-82cbd0f61851",
        members: [
          {
            userId: "7d914909-c903-41a4-a13a-82cbd0f61851",
            name: "Dale",
            role: "owner",
          },
        ],
        createdAt: "2026-07-10T12:00:00.000Z",
      },
    },
    isPending: false,
    isError: false,
    error: null,
  };
}

function errorQueryResult(status: number, message: string) {
  return {
    data: undefined,
    isPending: false,
    isError: true,
    error: new ApiError(status, { error: message }),
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

describe("AppTeam", () => {
  it("shows the create-team form when the user has no team", async () => {
    await renderTeam();
    expect(document.body.textContent).toContain("Start a team");
    expect(document.getElementById("tm-name-input")).not.toBeNull();
  });

  it("shows team details when the user has a team", async () => {
    await renderTeam();
    await setQueryResult(teamQueryResult());
    expect(document.body.textContent).toContain("Field Ops");
    expect(document.body.textContent).toContain("Dale");
    expect(document.body.textContent).toContain("Owner");
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
    queryResult = { data: undefined, isLoading: true, isPending: true, isError: false, error: null };
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
