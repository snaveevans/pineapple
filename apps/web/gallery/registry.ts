import type { Page } from "@playwright/test";
import { DEFERRED } from "./deferred-entries.ts";
import {
  ACTIVITY_EMPTY,
  ACTIVITY_PAGINATED,
  ACTIVITY_POPULATED,
  ASSETS_EMPTY,
  ASSETS_NO_PROPERTY,
  ASSETS_POPULATED,
  NOTIFICATIONS_EMPTY,
  NOTIFICATIONS_PAGINATED,
  NOTIFICATIONS_POPULATED,
  TEAM_EMPTY,
  TEAM_POPULATED,
  activityFilteredEmpty,
  activityFilteredPopulated,
} from "./fixtures.ts";

export type GalleryCategory = "rendered" | "deferred" | "excluded";

export type ViewportName = "desktop" | "mobile";

export type ApiStub =
  | { kind: "json"; status?: number; body: unknown }
  | { kind: "pending" }
  | { kind: "handler"; handle: (url: URL, method: string) => ApiStub | null };

export type RouteStubs = {
  /** Always stubbed unless overridden: GET /api/users/me and chrome notifications. */
  assets?: ApiStub;
  notifications?: ApiStub;
  /** Page-level notifications (limit=20) vs chrome (limit=1) share path — one stub. */
  activity?: ApiStub;
  teamsMe?: ApiStub;
};

export type RenderedState = {
  id: string;
  category: "rendered";
  route: string;
  stubs: RouteStubs;
  localStorage?: Record<string, string>;
  /** Wait until the target UI is stable. */
  ready: (page: Page) => Promise<void>;
  /** Optional interaction after first paint (filters, form open). */
  interact?: (page: Page) => Promise<void>;
};

export type DeferredState = {
  id: string;
  category: "deferred";
  issue: number;
  reason: string;
};

export type ExcludedState = {
  id: string;
  category: "excluded";
  issue: number;
  reason: string;
};

export type RegistryEntry = RenderedState | DeferredState | ExcludedState;

const json = (body: unknown, status = 200): ApiStub => ({ kind: "json", status, body });
const pending = (): ApiStub => ({ kind: "pending" });
const err500 = (message = "Something went wrong"): ApiStub => json({ error: message }, 500);

async function clickChip(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

const RENDERED: RenderedState[] = [
  // ── Asset Library (6) ──────────────────────────────────────────────
  {
    id: "asset-library/loading",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: pending() },
    ready: async (page) => {
      await page.getByText("Loading assets").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/error",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: err500() },
    ready: async (page) => {
      await page.getByText("Assets could not be loaded").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/empty-no-assets-owned",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_EMPTY) },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/empty-filtered",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_NO_PROPERTY) },
    ready: async (page) => {
      await page.getByRole("button", { name: /Properties/ }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await clickChip(page, /Properties/);
      await page.getByText(/No properties yet/i).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/populated",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_POPULATED) },
    localStorage: { "fieldops:assets:view": "grid" },
    ready: async (page) => {
      await page.getByText("Truck").waitFor({ state: "visible" });
      await page.getByText("Generator").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/populated-filtered",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_POPULATED) },
    localStorage: { "fieldops:assets:view": "grid" },
    ready: async (page) => {
      await page.getByText("Truck").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await clickChip(page, /Vehicles/);
      await page.getByText("Truck").waitFor({ state: "visible" });
      await page.getByText("Generator").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: /Vehicles/, pressed: true }).waitFor({
        state: "visible",
      });
    },
  },

  // ── Notifications (5) ──────────────────────────────────────────────
  {
    id: "notifications/loading",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: pending() },
    ready: async (page) => {
      await page.getByLabel("Loading notifications").waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/error",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: err500() },
    ready: async (page) => {
      await page.getByText("Notifications could not be loaded").waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/empty",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: json(NOTIFICATIONS_EMPTY) },
    ready: async (page) => {
      await page.getByText("You're all caught up").waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/populated",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: json(NOTIFICATIONS_POPULATED) },
    ready: async (page) => {
      await page.getByText("Oil change").waitFor({ state: "visible" });
      await page.getByText("Blade sharpen").waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/populated-paginated",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: json(NOTIFICATIONS_PAGINATED) },
    ready: async (page) => {
      await page.getByText("Oil change").waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Load older notifications/ }).waitFor({
        state: "visible",
      });
    },
  },

  // ── Activity History (7) ───────────────────────────────────────────
  {
    id: "activity-history/loading",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: pending() },
    ready: async (page) => {
      await page.getByText("Loading your history...").waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/error",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: err500() },
    ready: async (page) => {
      await page.getByText("History could not be loaded").waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/empty-no-account-history",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_EMPTY) },
    ready: async (page) => {
      await page.getByText("Nothing here yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/empty-filtered",
    category: "rendered",
    route: "/app/history",
    stubs: {
      activity: {
        kind: "handler",
        handle: (url) => {
          // First paint loads full filters; after chip click, type filter returns empty rows.
          if (url.searchParams.has("type")) return json(activityFilteredEmpty());
          return json(ACTIVITY_POPULATED);
        },
      },
    },
    ready: async (page) => {
      await page.getByText("Cabin filter").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      // Pick a type chip with count 0 — Assets added is always 0 in the fixture filters.
      await clickChip(page, /Assets added/);
      await page.getByText("No matching activity").waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/populated",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_POPULATED) },
    ready: async (page) => {
      await page.getByText("Cabin filter").waitFor({ state: "visible" });
      await page.getByText("Oil change").waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/populated-filtered",
    category: "rendered",
    route: "/app/history",
    stubs: {
      activity: {
        kind: "handler",
        handle: (url) => {
          if (url.searchParams.get("type") === "task_scheduled") {
            return json(activityFilteredPopulated());
          }
          return json(ACTIVITY_POPULATED);
        },
      },
    },
    ready: async (page) => {
      await page.getByText("Cabin filter").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await clickChip(page, /Tasks scheduled/);
      await page.getByText("Cabin filter").waitFor({ state: "visible" });
      await page.getByText("Oil change").waitFor({ state: "hidden" });
    },
  },
  {
    id: "activity-history/populated-paginated",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_PAGINATED) },
    ready: async (page) => {
      await page.getByText("Cabin filter").waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Load older activity/ }).waitFor({
        state: "visible",
      });
    },
  },

  // ── Team (5) ───────────────────────────────────────────────────────
  {
    id: "team/loading",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: pending() },
    ready: async (page) => {
      await page.getByText("Loading…").waitFor({ state: "visible" });
    },
  },
  {
    id: "team/error",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: err500("Team service unavailable") },
    ready: async (page) => {
      await page.getByText("Could not load your team").waitFor({ state: "visible" });
    },
  },
  {
    id: "team/empty-no-team",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: json(TEAM_EMPTY) },
    ready: async (page) => {
      await page.getByText("You don't have a team yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "team/form-create-team",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: json(TEAM_EMPTY) },
    ready: async (page) => {
      await page.getByText("You don't have a team yet").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).click();
      await page.getByPlaceholder(/Ortega Household/).waitFor({ state: "visible" });
    },
  },
  {
    id: "team/populated-has-team",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: json(TEAM_POPULATED) },
    ready: async (page) => {
      await page.getByText("The Ortega Household").waitFor({ state: "visible" });
      await page.getByText("Jamie Ortega").waitFor({ state: "visible" });
    },
  },
];

const EXCLUDED: ExcludedState[] = [
  {
    id: "notifications/unauthorized-401",
    category: "excluded",
    issue: 195,
    reason: "Transient 401 redirect unmounts before capture (#191)",
  },
  {
    id: "asset-library/unauthorized-401",
    category: "excluded",
    issue: 195,
    reason: "Transient 401 redirect unmounts before capture (#191)",
  },
  {
    id: "activity-history/unauthorized-401",
    category: "excluded",
    issue: 195,
    reason: "Transient 401 redirect unmounts before capture (#191)",
  },
  {
    id: "team/unauthorized-401",
    category: "excluded",
    issue: 195,
    reason: "Transient 401 redirect unmounts before capture (#191)",
  },
];

export const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

export function renderedStates(): RenderedState[] {
  return RENDERED;
}

/**
 * Full hand-authored registry. Nothing is synthesized from FEATURES.md —
 * a new FEATURES id with no entry here fails the coverage check.
 */
export function registryEntries(): RegistryEntry[] {
  return [...RENDERED, ...EXCLUDED, ...DEFERRED];
}

export function assertRegistryInvariants(entries: RegistryEntry[]): void {
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`duplicate registry id ${e.id}`);
    ids.add(e.id);
    if (e.category === "deferred" || e.category === "excluded") {
      if (!Number.isInteger(e.issue) || e.issue <= 0) {
        throw new Error(`${e.id}: ${e.category} entry must name a positive issue number`);
      }
    }
  }
  if (RENDERED.length !== 23) {
    throw new Error(`expected 23 rendered states, got ${RENDERED.length}`);
  }
  if (EXCLUDED.length !== 4) {
    throw new Error(`expected 4 excluded states, got ${EXCLUDED.length}`);
  }
}
