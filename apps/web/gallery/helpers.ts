import type { Page } from "@playwright/test";

export type GalleryCategory = "rendered" | "excluded";

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
  /** PATCH /api/users/me */
  patchMe?: ApiStub;
  /** PUT /api/users/me/notification-email */
  putNotificationEmail?: ApiStub;
  /** DELETE /api/users/me/notification-email */
  deleteNotificationEmail?: ApiStub;
  /** POST /api/users/me/notification-email/verification */
  postNotificationEmailVerification?: ApiStub;
  /** POST /api/notifications/{id}/read */
  postNotificationRead?: ApiStub;
  /** POST /api/notifications/read-all */
  postNotificationsReadAll?: ApiStub;
  /** POST /api/assets */
  postAsset?: ApiStub;
  /** POST /api/assets/{id}/maintenance-records */
  postMaintenanceRecord?: ApiStub;
  /** POST /api/assets/{id}/maintenance-tasks */
  postMaintenanceTask?: ApiStub;
  /** DELETE /api/assets/{id}/maintenance-tasks/{taskId} */
  deleteMaintenanceTask?: ApiStub;
  /** POST /api/assets/{id}/share */
  postShare?: ApiStub;
  /** DELETE /api/assets/{id}/share */
  deleteShare?: ApiStub;
  /** POST /api/teams */
  postTeam?: ApiStub;
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

export type ExcludedState = {
  id: string;
  category: "excluded";
  issue: number;
  reason: string;
};

export type RegistryEntry = RenderedState | ExcludedState;

export const json = (body: unknown, status = 200): ApiStub => ({ kind: "json", status, body });
export const pending = (): ApiStub => ({ kind: "pending" });
export const err500 = (message = "Something went wrong"): ApiStub => json({ error: message }, 500);
export const errStatus = (status: number, message: string): ApiStub =>
  json({ error: message }, status);

export async function clickChip(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

/** Advance fake timers so React Query retries / search debounce can settle. */
export async function advance(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

export async function openSearch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Search assets" }).click();
  await page.getByRole("dialog", { name: "Search assets" }).waitFor({ state: "visible" });
}

export async function typeSearchQuery(page: Page, query: string): Promise<void> {
  const input = page.getByRole("dialog", { name: "Search assets" }).locator("input").first();
  await input.fill(query);
  await advance(page, 300);
}

/** Fill an HF field by its visible label text (labels are not htmlFor-linked). */
export async function fillLabeledInput(page: Page, label: string, value: string): Promise<void> {
  await page.locator(".hf-field", { hasText: label }).locator("input").first().fill(value);
}
