import type { Page } from "@playwright/test";
import { DEFERRED } from "./deferred-entries.ts";
import {
  ACTIVITY_EMPTY,
  ACTIVITY_PAGINATED,
  ACTIVITY_POPULATED,
  ASSET_OWNED,
  ASSET_SHARED_BY,
  ASSETS_EMPTY,
  ASSETS_NO_PROPERTY,
  ASSETS_POPULATED,
  AUTH_SESSION_AUTHENTICATED,
  AUTH_SESSION_NONE,
  DASHBOARD_EMPTY_FLEET,
  DASHBOARD_NO_TASKS,
  DASHBOARD_POPULATED,
  GENERATOR_ID,
  NOTIFICATIONS_EMPTY,
  NOTIFICATIONS_PAGINATED,
  NOTIFICATIONS_POPULATED,
  PROFILE,
  PROFILE_INCOMPLETE_NO_NAME,
  PROFILE_INCOMPLETE_WITH_NAME,
  RECORDS_EMPTY,
  RECORDS_POPULATED,
  RECORDS_POPULATED_SHARED,
  SEARCH_EMPTY,
  SEARCH_POPULATED,
  TASKS_EMPTY,
  TASKS_POPULATED,
  TASKS_POPULATED_SHARED,
  TEAM_EMPTY,
  TEAM_POPULATED,
  TRUCK_ID,
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
  /** GET /api/users/me — defaults to PROFILE when omitted. */
  me?: ApiStub;
  /** GET /api/assets (list). */
  assets?: ApiStub;
  /** GET /api/assets/{id}. */
  asset?: ApiStub;
  /** GET /api/assets/{id}/maintenance-records. */
  maintenanceRecords?: ApiStub;
  /** GET /api/assets/{id}/maintenance-tasks. */
  maintenanceTasks?: ApiStub;
  notifications?: ApiStub;
  /** Page-level notifications (limit=20) vs chrome (limit=1) share path — one stub. */
  activity?: ApiStub;
  teamsMe?: ApiStub;
  /** GET /api/dashboard. */
  dashboard?: ApiStub;
  /** GET /api/search. */
  search?: ApiStub;
  /** GET /api/auth/get-session. */
  authSession?: ApiStub;
  /** POST /api/auth/sign-in/social. */
  authSignInSocial?: ApiStub;
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

/** Advance fake timers so React Query retries / search debounce can settle. */
async function advance(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

async function openSearch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Search assets" }).click();
  await page.getByRole("dialog", { name: "Search assets" }).waitFor({ state: "visible" });
}

async function typeSearchQuery(page: Page, query: string): Promise<void> {
  const input = page.getByRole("dialog", { name: "Search assets" }).locator("input").first();
  await input.fill(query);
  await advance(page, 300);
}

const MAINTENANCE_ROUTE = `/app/assets/${TRUCK_ID}/maintenance`;
const MAINTENANCE_SHARED_ROUTE = `/app/assets/${GENERATOR_ID}/maintenance`;

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
      await advance(page, 5_000);
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
      await advance(page, 5_000);
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
      await advance(page, 5_000);
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
      await advance(page, 5_000);
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

  // ── Marketing Home (2) ─────────────────────────────────────────────
  {
    id: "marketing-home/unauthenticated",
    category: "rendered",
    route: "/",
    stubs: { authSession: json(AUTH_SESSION_NONE) },
    ready: async (page) => {
      await page.getByRole("link", { name: "Get started" }).first().waitFor({ state: "visible" });
      await page.getByRole("link", { name: "Log in" }).first().waitFor({ state: "visible" });
    },
  },
  {
    id: "marketing-home/authenticated",
    category: "rendered",
    route: "/",
    stubs: { authSession: json(AUTH_SESSION_AUTHENTICATED) },
    ready: async (page) => {
      await page.getByRole("link", { name: "Go to App" }).first().waitFor({ state: "visible" });
    },
  },

  // ── Sign In (3) ────────────────────────────────────────────────────
  {
    id: "sign-in/idle",
    category: "rendered",
    route: "/login",
    stubs: { authSession: json(AUTH_SESSION_NONE) },
    ready: async (page) => {
      await page.getByText("Log in to FieldOps").waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Continue with Google/ }).waitFor({
        state: "visible",
      });
    },
  },
  {
    id: "sign-in/in-flight",
    category: "rendered",
    route: "/login",
    stubs: {
      authSession: json(AUTH_SESSION_NONE),
      authSignInSocial: pending(),
    },
    ready: async (page) => {
      await page.getByText("Log in to FieldOps").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: /Continue with Google/ }).click();
      await page.getByText("Connecting to Google…").waitFor({ state: "visible" });
    },
  },
  {
    id: "sign-in/error",
    category: "rendered",
    route: "/login?error=google",
    stubs: { authSession: json(AUTH_SESSION_NONE) },
    ready: async (page) => {
      await page.getByText("Something went wrong").waitFor({ state: "visible" });
      await page.getByText(/sign-in could not be completed/).waitFor({ state: "visible" });
    },
  },

  // ── User Profile & Onboarding (5) ──────────────────────────────────
  {
    id: "user-profile-and-onboarding/loading",
    category: "rendered",
    route: "/onboarding",
    stubs: { me: pending() },
    ready: async (page) => {
      await page.getByText("Loading your profile…").waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/error",
    category: "rendered",
    route: "/onboarding",
    stubs: { me: err500("Profile unavailable") },
    ready: async (page) => {
      // Product has no distinct load-error UI — settled failure stays on the spinner.
      await advance(page, 5_000);
      await page.getByText("Loading your profile…").waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/populated-incomplete-onboarding-provider-name-available",
    category: "rendered",
    route: "/onboarding",
    stubs: { me: json(PROFILE_INCOMPLETE_WITH_NAME) },
    ready: async (page) => {
      await page.getByText("Set up your profile").waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Confirm & get started/ }).waitFor({
        state: "visible",
      });
      await page.getByText(/Imported from your Google account/).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/populated-incomplete-onboarding-no-provider-name",
    category: "rendered",
    route: "/onboarding",
    stubs: { me: json(PROFILE_INCOMPLETE_NO_NAME) },
    ready: async (page) => {
      await page.getByText("Set up your profile").waitFor({ state: "visible" });
      await page.getByRole("button", { name: /^Get started$/ }).waitFor({ state: "visible" });
      await page.getByText(/This is how you'll appear/).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/populated-profile-edit",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Edit profile" }).waitFor({ state: "visible" });
      await page.locator('input[value="Dale Evans"]').waitFor({ state: "visible" });
    },
  },

  // ── Authenticated App Shell (10) ───────────────────────────────────
  {
    id: "authenticated-app-shell/desktop",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      me: json(PROFILE),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    // Viewport-driven: both desktop and mobile shots land; chrome CSS switches layout.
    ready: async (page) => {
      await page.getByText("FieldOps").first().waitFor({ state: "visible" });
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "authenticated-app-shell/mobile",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      me: json(PROFILE),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    // Same host as desktop; the mobile shot is the meaningful one (bottom nav).
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "authenticated-app-shell/active-route",
    category: "rendered",
    route: "/app/assets",
    stubs: {
      assets: json(ASSETS_EMPTY),
      me: json(PROFILE),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    ready: async (page) => {
      // Route is /app/assets — empty library proves the active Assets destination rendered.
      await page.getByText("No assets yet").waitFor({ state: "visible" });
      await page.locator('a[aria-current="page"]', { hasText: "Assets" }).first().waitFor({
        state: "attached",
      });
    },
  },
  {
    id: "authenticated-app-shell/loading-profile",
    category: "rendered",
    route: "/app",
    stubs: {
      me: pending(),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    ready: async (page) => {
      // OnboardingGuard holds the shell until me resolves — capture that spinner.
      await page.getByText("Loading your profile…").waitFor({ state: "visible" });
    },
  },
  {
    id: "authenticated-app-shell/populated-profile",
    category: "rendered",
    route: "/app",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
      await page.locator("a.hf-avatar", { hasText: "D" }).waitFor({ state: "visible" });
    },
  },
  {
    id: "authenticated-app-shell/error-profile",
    category: "rendered",
    route: "/app",
    stubs: {
      me: err500("Profile unavailable"),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    ready: async (page) => {
      // Guard has no distinct error UI — settled failure stays on the spinner.
      await advance(page, 5_000);
      await page.getByText("Loading your profile…").waitFor({ state: "visible" });
    },
  },
  {
    id: "authenticated-app-shell/loading-notifications",
    category: "rendered",
    route: "/app",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: pending(),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
      await page.getByLabel("Notifications").waitFor({ state: "visible" });
      await page.locator(".hf-badge").waitFor({ state: "hidden" });
    },
  },
  {
    id: "authenticated-app-shell/populated-notifications-zero-unread",
    category: "rendered",
    route: "/app",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: json(NOTIFICATIONS_EMPTY),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
      await page.getByLabel("Notifications").waitFor({ state: "visible" });
      await page.locator(".hf-badge").waitFor({ state: "hidden" });
    },
  },
  {
    id: "authenticated-app-shell/populated-notifications-has-unread",
    category: "rendered",
    route: "/app",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: json(NOTIFICATIONS_POPULATED),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
      await page.getByLabel("Notifications, 1 unread").waitFor({ state: "visible" });
      await page.locator(".hf-badge").waitFor({ state: "visible" });
    },
  },
  {
    id: "authenticated-app-shell/error-notifications",
    category: "rendered",
    route: "/app",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      notifications: err500("Notifications unavailable"),
    },
    ready: async (page) => {
      await advance(page, 5_000);
      await page.getByText("No assets yet").waitFor({ state: "visible" });
      await page.getByLabel("Notifications").waitFor({ state: "visible" });
      await page.locator(".hf-badge").waitFor({ state: "hidden" });
    },
  },

  // ── Dashboard (Home) (6) ───────────────────────────────────────────
  {
    id: "dashboard-home/loading",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: pending() },
    ready: async (page) => {
      await page.getByText("Loading dashboard").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/error",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: err500("Dashboard unavailable") },
    ready: async (page) => {
      await advance(page, 5_000);
      await page.getByText("Dashboard could not be loaded").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/empty-empty-fleet",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_EMPTY_FLEET) },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/empty-no-scheduled-tasks",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_NO_TASKS) },
    ready: async (page) => {
      await page.getByText("No scheduled maintenance yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/empty-filtered",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_POPULATED) },
    ready: async (page) => {
      // Queue row text (detail card is desktop-only / may be off-screen on mobile).
      await page.locator(".hf-row-name", { hasText: "Work Truck" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await clickChip(page, /Properties/);
      await page.getByText("No tasks in this category").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/populated",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_POPULATED) },
    ready: async (page) => {
      await page.getByText("Hey Dale").waitFor({ state: "visible" });
      await page.locator(".hf-row-name", { hasText: "Work Truck" }).waitFor({ state: "visible" });
      await page.locator(".hf-row-sub", { hasText: "Oil change" }).waitFor({ state: "visible" });
    },
  },

  // ── App Search (6) ─────────────────────────────────────────────────
  {
    id: "app-search/closed",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_EMPTY_FLEET) },
    ready: async (page) => {
      await page.getByRole("button", { name: "Search assets" }).waitFor({ state: "visible" });
      await page.getByRole("dialog", { name: "Search assets" }).waitFor({ state: "hidden" });
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/open-idle-empty-query",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_EMPTY_FLEET) },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await page.getByText("Search your assets").waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/loading",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      search: pending(),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "truck");
      await page.getByLabel("Loading search results").waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/error",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      search: err500("Search service unavailable"),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "truck");
      await page.getByText("Search could not run").waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/empty-no-matches",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      search: json(SEARCH_EMPTY),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "zzzz");
      await page.getByText(/No assets match/).waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/populated",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      search: json(SEARCH_POPULATED),
    },
    ready: async (page) => {
      await page.getByText("No assets yet").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "truck");
      await page.getByText("Work Truck").waitFor({ state: "visible" });
      await page.getByText("Shared by Pat").waitFor({ state: "visible" });
    },
  },

  // ── Add Asset (3) ──────────────────────────────────────────────────
  {
    id: "add-asset/idle-vehicle-type",
    category: "rendered",
    route: "/app/assets/new",
    stubs: {},
    ready: async (page) => {
      await page.getByRole("heading", { name: "Add an asset" }).waitFor({ state: "visible" });
      await page.getByRole("radio", { name: /Vehicle/, checked: true }).waitFor({
        state: "visible",
      });
      await page.getByText("Vehicle details").waitFor({ state: "visible" });
    },
  },
  {
    id: "add-asset/idle-property-type",
    category: "rendered",
    route: "/app/assets/new",
    stubs: {},
    ready: async (page) => {
      await page.getByRole("heading", { name: "Add an asset" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("radio", { name: /Property/ }).click();
      await page.getByRole("radio", { name: /Property/, checked: true }).waitFor({
        state: "visible",
      });
      await page.getByText("Property details").waitFor({ state: "visible" });
    },
  },
  {
    id: "add-asset/idle-equipment-type",
    category: "rendered",
    route: "/app/assets/new",
    stubs: {},
    ready: async (page) => {
      await page.getByRole("heading", { name: "Add an asset" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("radio", { name: /Equipment/ }).click();
      await page.getByRole("radio", { name: /Equipment/, checked: true }).waitFor({
        state: "visible",
      });
      await page.getByText("Equipment details").waitFor({ state: "visible" });
    },
  },

  // ── Asset Maintenance Records & Tasks (8) ──────────────────────────
  {
    id: "asset-maintenance-records-and-tasks/loading",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: { asset: pending() },
    ready: async (page) => {
      await page.locator(".mr-hero .mr-skel").first().waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/error-forbidden-403",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: { asset: json({ error: "Forbidden" }, 403) },
    ready: async (page) => {
      await advance(page, 5_000);
      await page.getByText("Access denied").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/error-not-found-404",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: { asset: json({ error: "Asset not found" }, 404) },
    ready: async (page) => {
      await advance(page, 5_000);
      await page.getByText("Asset not found").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/error-load-failure",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: { asset: err500("Something went wrong") },
    ready: async (page) => {
      await advance(page, 5_000);
      await page.getByText("Couldn't load history").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/empty-no-records",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_EMPTY),
      maintenanceTasks: json(TASKS_EMPTY),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("tab", { name: /Maintenance/ }).click();
      await page.getByText("No maintenance logged yet").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/empty-no-tasks",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_EMPTY),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
      await page.getByText(/No scheduled tasks/).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/populated",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_POPULATED),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
      await page.getByText("Oil change").first().waitFor({ state: "visible" });
      await page.getByText("Cabin filter").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/populated-shared-by-teammate",
    category: "rendered",
    route: MAINTENANCE_SHARED_ROUTE,
    stubs: {
      asset: json(ASSET_SHARED_BY),
      maintenanceRecords: json(RECORDS_POPULATED_SHARED),
      maintenanceTasks: json(TASKS_POPULATED_SHARED),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Generator" }).waitFor({ state: "visible" });
      await page
        .getByText(/Shared by Pat Rivera/)
        .first()
        .waitFor({ state: "visible" });
      await page.getByText(/you can view and log/).waitFor({ state: "visible" });
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
  if (RENDERED.length !== 66) {
    throw new Error(`expected 66 rendered states, got ${RENDERED.length}`);
  }
  if (EXCLUDED.length !== 4) {
    throw new Error(`expected 4 excluded states, got ${EXCLUDED.length}`);
  }
}
