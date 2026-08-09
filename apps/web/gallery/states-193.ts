/**
 * Issue #193 — mutation, local, notice, contact-email, add-service-drawer,
 * and content-stress gallery states (slice 3 of 3).
 */
import type { Page } from "@playwright/test";
import {
  ACTIVITY_LONG_ACTOR,
  ACTIVITY_LONG_ASSET,
  ACTIVITY_LONG_TITLE,
  ACTIVITY_PAGINATION_BOUNDARY,
  ASSET_LONG_NAME,
  ASSET_LONG_OWNER,
  ASSET_OWNED,
  ASSETS_EMPTY,
  ASSETS_LONG_ADDRESS,
  ASSETS_LONG_NAME,
  ASSETS_LONG_OWNER,
  ASSETS_POPULATED,
  DASHBOARD_EMPTY_FLEET,
  DASHBOARD_LONG_ASSET,
  DASHBOARD_LONG_OWNER,
  DASHBOARD_LONG_TASK,
  DASHBOARD_POPULATED,
  DISPLAY_NAME_100,
  GENERATOR_ID,
  LONG_ASSET_NAME,
  LONG_CITY,
  LONG_CONTACT_EMAIL,
  LONG_STREET,
  NOTIFICATIONS_LONG_ASSET,
  NOTIFICATIONS_LONG_TASK,
  NOTIFICATIONS_PAGINATION_BOUNDARY,
  NOTIFICATIONS_POPULATED,
  PROFILE,
  PROFILE_CONTACT_UNVERIFIED,
  PROFILE_CONTACT_VERIFIED,
  PROFILE_DISPLAY_NAME_100,
  PROFILE_LONG_CONTACT_EMAIL,
  RECORDS_LONG_NOTES,
  RECORDS_POPULATED,
  SEARCH_LONG_ASSET,
  SEARCH_LONG_OWNER,
  SEARCH_LONG_SUMMARY,
  TASK_TITLE_100,
  TASKS_LONG_TITLE,
  TASKS_POPULATED,
  TEAM_EMPTY,
  TEAM_LONG_MEMBER,
  TEAM_LONG_NAME,
  TEAM_NAME_100,
  TEAM_POPULATED,
  TRUCK_ID,
  profileAfterEmailSet,
} from "./fixtures.ts";
import {
  advance,
  err500,
  errStatus,
  fillLabeledInput,
  json,
  openSearch,
  pending,
  type RenderedState,
  typeSearchQuery,
} from "./helpers.ts";

const MAINTENANCE_ROUTE = `/app/assets/${TRUCK_ID}/maintenance`;
const MAINTENANCE_SHARED_ROUTE = `/app/assets/${GENERATOR_ID}/maintenance`;

async function readyProfile(page: Page): Promise<void> {
  await page.locator("#pe-name-input").waitFor({ state: "visible" });
  await page.locator("#pe-email-input").waitFor({ state: "visible" });
}

async function readyDashboardQueue(page: Page): Promise<void> {
  await page.getByText(/Hey /).waitFor({ state: "visible" });
  await page.locator(".hf-row-sub").first().waitFor({ state: "visible" });
}

async function readyNotificationsList(page: Page): Promise<void> {
  await page.getByRole("heading", { name: "Notifications" }).waitFor({ state: "visible" });
}

async function openAddServiceDrawer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add service" }).click();
  await page.getByRole("dialog", { name: "Add a service" }).waitFor({ state: "visible" });
}

async function fillValidVehicleForm(page: Page, name = "Ford F-150"): Promise<void> {
  await fillLabeledInput(page, "Asset name", name);
  await fillLabeledInput(page, "Make", "Ford");
  await fillLabeledInput(page, "Model", "F-150");
  await fillLabeledInput(page, "Year", "2022");
}

export const STATES_193: RenderedState[] = [
  // ── User Profile & Onboarding ──────────────────────────────────────
  {
    id: "user-profile-and-onboarding/contact-email-unset",
    category: "rendered",
    route: "/app/profile",
    stubs: { me: json(PROFILE), dashboard: json(DASHBOARD_EMPTY_FLEET) },
    ready: async (page) => {
      await readyProfile(page);
      await page.locator("#pe-email-input").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/contact-email-unverified",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_CONTACT_UNVERIFIED),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page.getByText("Unverified").waitFor({ state: "visible" });
      await page
        .getByRole("button", { name: "Resend verification email" })
        .waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/contact-email-verified",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_CONTACT_VERIFIED),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page.getByText("Verified", { exact: true }).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/mutation-pending-patch-api-users-me-display-name",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      patchMe: pending(),
    },
    ready: readyProfile,
    interact: async (page) => {
      await page.locator("#pe-name-input").fill("New Name");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/mutation-pending-set-contact-email-put-api-users-me-notification-email",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      putNotificationEmail: pending(),
    },
    ready: readyProfile,
    interact: async (page) => {
      await page.locator("#pe-email-input").fill("dale@homemail.com");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/mutation-pending-remove-contact-email-delete-api-users-me-notification-email",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_CONTACT_UNVERIFIED),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      deleteNotificationEmail: pending(),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page.getByRole("button", { name: "Remove contact email" }).waitFor({
        state: "visible",
      });
    },
    interact: async (page) => {
      const remove = page.getByRole("button", { name: "Remove contact email" });
      await remove.click();
      await page.waitForFunction(
        (el) => {
          return el instanceof HTMLButtonElement && el.disabled;
        },
        await remove.elementHandle(),
      );
    },
  },
  {
    id: "user-profile-and-onboarding/mutation-pending-resend-verification-post-api-users-me-notification-email-verification",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_CONTACT_UNVERIFIED),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      postNotificationEmailVerification: pending(),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page
        .getByRole("button", { name: "Resend verification email" })
        .waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Resend verification email" }).click();
      await page.getByRole("button", { name: /Sending/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/mutation-error",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      patchMe: err500("Profile write failed"),
    },
    ready: readyProfile,
    interact: async (page) => {
      await page.locator("#pe-name-input").fill("New Name");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Profile could not be saved").waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/notice-verification-sent",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      putNotificationEmail: json(profileAfterEmailSet("dale@homemail.com", false)),
    },
    ready: readyProfile,
    interact: async (page) => {
      await page.locator("#pe-email-input").fill("dale@homemail.com");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByText(/Verification email sent to dale@homemail\.com/)
        .waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/notice-removed",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_CONTACT_UNVERIFIED),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      deleteNotificationEmail: json({
        ...PROFILE,
        notificationEmail: null,
        notificationEmailVerified: false,
      }),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page.getByRole("button", { name: "Remove contact email" }).waitFor({
        state: "visible",
      });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Remove contact email" }).click();
      await page
        .getByText(/Contact email removed\. Maintenance reminders will not be sent/)
        .waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/notice-cooldown",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_CONTACT_UNVERIFIED),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
      postNotificationEmailVerification: errStatus(429, "Too many requests"),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page
        .getByRole("button", { name: "Resend verification email" })
        .waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Resend verification email" }).click();
      await page
        .getByText("You can request another verification email in a few minutes.")
        .waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/content-stress-maximum-length-display-name",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_DISPLAY_NAME_100),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page.locator("#pe-name-input").waitFor({ state: "visible" });
      await page.getByText("100/100").waitFor({ state: "visible" });
    },
  },
  {
    id: "user-profile-and-onboarding/content-stress-long-contact-email-address",
    category: "rendered",
    route: "/app/profile",
    stubs: {
      me: json(PROFILE_LONG_CONTACT_EMAIL),
      dashboard: json(DASHBOARD_EMPTY_FLEET),
    },
    ready: async (page) => {
      await readyProfile(page);
      await page.locator("#pe-email-input").waitFor({ state: "visible" });
      await page.locator(`#pe-email-input[value="${LONG_CONTACT_EMAIL}"]`).waitFor({
        state: "visible",
      });
    },
  },

  // ── Notifications ──────────────────────────────────────────────────
  {
    id: "notifications/mutation-pending-mark-all-read",
    category: "rendered",
    route: "/app/notifications",
    stubs: {
      notifications: json(NOTIFICATIONS_POPULATED),
      postNotificationsReadAll: pending(),
    },
    ready: async (page) => {
      await readyNotificationsList(page);
      await page.getByRole("button", { name: "Mark all as read" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Mark all as read" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/mutation-error",
    category: "rendered",
    route: "/app/notifications",
    stubs: {
      notifications: json(NOTIFICATIONS_POPULATED),
      postNotificationsReadAll: err500("Notification write failed"),
    },
    ready: async (page) => {
      await readyNotificationsList(page);
      await page.getByRole("button", { name: "Mark all as read" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Mark all as read" }).click();
      await page.getByText("Notification write failed").waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/content-stress-long-asset-name-in-notification-rows",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: json(NOTIFICATIONS_LONG_ASSET) },
    ready: async (page) => {
      await readyNotificationsList(page);
      await page.getByText(LONG_ASSET_NAME).waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/content-stress-long-task-title",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: json(NOTIFICATIONS_LONG_TASK) },
    ready: async (page) => {
      await readyNotificationsList(page);
      await page.getByText(TASK_TITLE_100).waitFor({ state: "visible" });
    },
  },
  {
    id: "notifications/content-stress-collection-at-pagination-boundary",
    category: "rendered",
    route: "/app/notifications",
    stubs: { notifications: json(NOTIFICATIONS_PAGINATION_BOUNDARY) },
    ready: async (page) => {
      await readyNotificationsList(page);
      await page.getByRole("button", { name: "Load older notifications" }).waitFor({
        state: "visible",
      });
    },
  },

  // ── Dashboard Home ─────────────────────────────────────────────────
  {
    id: "dashboard-home/mutation-pending-mark-complete",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_POPULATED),
      postMaintenanceRecord: pending(),
    },
    ready: async (page) => {
      await readyDashboardQueue(page);
      await page.getByRole("button", { name: "Mark complete" }).waitFor({
        state: "visible",
      });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Mark complete" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/mutation-pending-add-service",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_POPULATED),
      assets: json(ASSETS_POPULATED),
      postMaintenanceTask: pending(),
    },
    ready: async (page) => {
      await readyDashboardQueue(page);
    },
    interact: async (page) => {
      await openAddServiceDrawer(page);
      await page.locator("#hf-svc-title").waitFor({ state: "visible" });
      await page.locator("#hf-svc-title").fill("Oil change");
      await page.getByRole("button", { name: "Save service" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/mutation-error",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_POPULATED),
      postMaintenanceRecord: err500("Could not mark task complete."),
    },
    ready: async (page) => {
      await readyDashboardQueue(page);
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Mark complete" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Could not mark task complete." })
        .first()
        .waitFor({
          state: "visible",
        });
    },
  },
  {
    id: "dashboard-home/add-service-drawer-loading",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_POPULATED),
      assets: pending(),
    },
    ready: async (page) => {
      await readyDashboardQueue(page);
    },
    interact: async (page) => {
      await openAddServiceDrawer(page);
      await page.getByText("Loading assets").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/add-service-drawer-error",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_POPULATED),
      assets: err500("Assets boom"),
    },
    ready: async (page) => {
      await readyDashboardQueue(page);
    },
    interact: async (page) => {
      await openAddServiceDrawer(page);
      await advance(page, 5_000);
      await page.getByText("Assets could not be loaded").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/add-service-drawer-empty",
    category: "rendered",
    route: "/app",
    stubs: {
      dashboard: json(DASHBOARD_POPULATED),
      assets: json(ASSETS_EMPTY),
    },
    ready: async (page) => {
      await readyDashboardQueue(page);
    },
    interact: async (page) => {
      await openAddServiceDrawer(page);
      await page.getByText("No assets available").waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/content-stress-long-asset-name-in-queue-rows-and-detail-card",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_LONG_ASSET) },
    ready: async (page) => {
      await page.locator(".hf-row-name", { hasText: LONG_ASSET_NAME }).waitFor({
        state: "visible",
      });
      // Detail card (desktop) also carries the name when the container is wide enough.
      await page.getByText(/Hey /).waitFor({ state: "visible" });
    },
  },
  {
    id: "dashboard-home/content-stress-long-task-title",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_LONG_TASK) },
    ready: async (page) => {
      await page.locator(".hf-row-sub", { hasText: TASK_TITLE_100 }).waitFor({
        state: "visible",
      });
    },
  },
  {
    id: "dashboard-home/content-stress-long-owner-display-name-in-sharing-badge",
    category: "rendered",
    route: "/app",
    stubs: { dashboard: json(DASHBOARD_LONG_OWNER) },
    ready: async (page) => {
      await page
        .locator(".hf-row .hf-share-badge", { hasText: DISPLAY_NAME_100 })
        .waitFor({ state: "visible" });
    },
  },

  // ── Asset Library ──────────────────────────────────────────────────
  {
    id: "asset-library/content-stress-long-asset-name-on-cards",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_LONG_NAME) },
    localStorage: { "fieldops:assets:view": "grid" },
    ready: async (page) => {
      await page.getByText(LONG_ASSET_NAME).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/content-stress-long-owner-display-name-in-sharing-badge",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_LONG_OWNER) },
    localStorage: { "fieldops:assets:view": "grid" },
    ready: async (page) => {
      await page.getByText(DISPLAY_NAME_100).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-library/content-stress-long-property-address-in-property-card-summaries",
    category: "rendered",
    route: "/app/assets",
    stubs: { assets: json(ASSETS_LONG_ADDRESS) },
    localStorage: { "fieldops:assets:view": "grid" },
    ready: async (page) => {
      await page.getByText(LONG_STREET).waitFor({ state: "visible" });
      await page.getByText(new RegExp(LONG_CITY)).waitFor({ state: "visible" });
    },
  },

  // ── App Search ─────────────────────────────────────────────────────
  {
    id: "app-search/content-stress-long-asset-name-in-result-rows",
    category: "rendered",
    route: "/app/assets",
    stubs: {
      assets: json(ASSETS_POPULATED),
      search: json(SEARCH_LONG_ASSET),
    },
    ready: async (page) => {
      await page.getByText("Truck").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "truck");
      await page.getByText(LONG_ASSET_NAME).waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/content-stress-long-summary-line",
    category: "rendered",
    route: "/app/assets",
    stubs: {
      assets: json(ASSETS_POPULATED),
      search: json(SEARCH_LONG_SUMMARY),
    },
    ready: async (page) => {
      await page.getByText("Truck").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "truck");
      await page.getByText(/extended cargo package/).waitFor({ state: "visible" });
    },
  },
  {
    id: "app-search/content-stress-long-owner-display-name-in-sharing-badge",
    category: "rendered",
    route: "/app/assets",
    stubs: {
      assets: json(ASSETS_POPULATED),
      search: json(SEARCH_LONG_OWNER),
    },
    ready: async (page) => {
      await page.getByText("Truck").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await openSearch(page);
      await typeSearchQuery(page, "ram");
      await page.getByText(DISPLAY_NAME_100).waitFor({ state: "visible" });
    },
  },

  // ── Activity History ───────────────────────────────────────────────
  {
    id: "activity-history/content-stress-long-asset-name-in-entries",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_LONG_ASSET) },
    ready: async (page) => {
      await page.getByText(LONG_ASSET_NAME).waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/content-stress-long-action-title",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_LONG_TITLE) },
    ready: async (page) => {
      await page.getByText(TASK_TITLE_100).waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/content-stress-long-teammate-display-name-in-actor-attribution",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_LONG_ACTOR) },
    ready: async (page) => {
      await page.getByText(DISPLAY_NAME_100).waitFor({ state: "visible" });
    },
  },
  {
    id: "activity-history/content-stress-collection-at-pagination-boundary",
    category: "rendered",
    route: "/app/history",
    stubs: { activity: json(ACTIVITY_PAGINATION_BOUNDARY) },
    ready: async (page) => {
      await page.getByRole("button", { name: /Load older activity/ }).waitFor({
        state: "visible",
      });
    },
  },

  // ── Add Asset ──────────────────────────────────────────────────────
  {
    id: "add-asset/mutation-pending",
    category: "rendered",
    route: "/app/assets/new",
    stubs: {
      assets: json(ASSETS_EMPTY),
      postAsset: pending(),
    },
    ready: async (page) => {
      await page.getByText("Add asset").waitFor({ state: "visible" });
      await page.getByText("Asset type").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await fillValidVehicleForm(page);
      await page.getByRole("button", { name: "Save asset" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "add-asset/mutation-error-client-validation",
    category: "rendered",
    route: "/app/assets/new",
    stubs: { assets: json(ASSETS_EMPTY) },
    ready: async (page) => {
      await page.getByText("Add asset").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Save asset" }).click();
      await page.locator(".hf-aa-banner-title").waitFor({ state: "visible" });
      await page
        .getByText(/fields? need attention/)
        .first()
        .waitFor({ state: "visible" });
    },
  },
  {
    id: "add-asset/mutation-error-api",
    category: "rendered",
    route: "/app/assets/new",
    stubs: {
      assets: json(ASSETS_EMPTY),
      postAsset: err500("Asset write failed"),
    },
    ready: async (page) => {
      await page.getByText("Asset type").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await fillValidVehicleForm(page);
      await page.getByRole("button", { name: "Save asset" }).click();
      await page.locator(".hf-aa-banner-title", { hasText: "Asset could not be saved" }).waitFor({
        state: "visible",
      });
    },
  },
  {
    id: "add-asset/content-stress-long-asset-name",
    category: "rendered",
    route: "/app/assets/new",
    stubs: { assets: json(ASSETS_EMPTY) },
    ready: async (page) => {
      await page.getByText("Asset type").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await fillLabeledInput(page, "Asset name", LONG_ASSET_NAME);
      await page.locator(`.hf-input[value="${LONG_ASSET_NAME}"]`).waitFor({ state: "visible" });
    },
  },
  {
    id: "add-asset/content-stress-long-property-address",
    category: "rendered",
    route: "/app/assets/new",
    stubs: { assets: json(ASSETS_EMPTY) },
    ready: async (page) => {
      await page.getByText("Asset type").waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("radio", { name: /Property/ }).click();
      await fillLabeledInput(page, "Asset name", "Mountain Cabin");
      await fillLabeledInput(page, "Street", LONG_STREET);
      await fillLabeledInput(page, "City", LONG_CITY);
      await fillLabeledInput(page, "State", "CA");
      await fillLabeledInput(page, "Postal", "93001");
      await page.locator(`.hf-input[value="${LONG_STREET}"]`).waitFor({ state: "visible" });
    },
  },

  // ── Asset Maintenance ──────────────────────────────────────────────
  {
    id: "asset-maintenance-records-and-tasks/mutation-pending-create-record",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_POPULATED),
      postMaintenanceRecord: pending(),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page
        .getByRole("button", { name: /Log maintenance|Add record|Add the first record/ })
        .first()
        .click();
      await page.locator("#mr-title").waitFor({ state: "visible" });
      await page.locator("#mr-title").fill("Oil change");
      await page.getByRole("button", { name: "Save record" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/mutation-pending-create-task",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_POPULATED),
      dashboard: json(DASHBOARD_POPULATED),
      postMaintenanceTask: pending(),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Add task" }).click();
      await page.locator("#mt-title").waitFor({ state: "visible" });
      await page.locator("#mt-title").fill("Oil change");
      await page.getByRole("button", { name: "Save task" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/mutation-pending-share-unshare-owner-only",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_POPULATED),
      teamsMe: json(TEAM_POPULATED),
      postShare: pending(),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Share to team" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Share to team" }).click();
      await page.getByRole("button", { name: /Share with/ }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Share with/ }).click();
      await page.getByRole("button", { name: /Sharing/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/mutation-error",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_POPULATED),
      postMaintenanceRecord: err500("Failed to save. Please try again."),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page
        .getByRole("button", { name: /Log maintenance|Add record/ })
        .first()
        .click();
      await page.locator("#mr-title").waitFor({ state: "visible" });
      await page.locator("#mr-title").fill("Oil change");
      await page.getByRole("button", { name: "Save record" }).click();
      await page.getByText("Failed to save. Please try again.").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/local-delete-task-confirm",
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
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Delete task" }).first().click();
      await page.getByText("Delete task?").waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/content-stress-long-asset-name-in-header",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_LONG_NAME),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_POPULATED),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: LONG_ASSET_NAME }).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/content-stress-long-record-description",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_LONG_NOTES),
      maintenanceTasks: json(TASKS_POPULATED),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("tab", { name: /Maintenance/ }).click();
      await page.getByText(/Used 7 quarts of full synthetic/).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/content-stress-long-task-title",
    category: "rendered",
    route: MAINTENANCE_ROUTE,
    stubs: {
      asset: json(ASSET_OWNED),
      maintenanceRecords: json(RECORDS_POPULATED),
      maintenanceTasks: json(TASKS_LONG_TITLE),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Truck" }).waitFor({ state: "visible" });
      await page.getByText(TASK_TITLE_100).waitFor({ state: "visible" });
    },
  },
  {
    id: "asset-maintenance-records-and-tasks/content-stress-long-owner-display-name-in-sharing-badge",
    category: "rendered",
    route: MAINTENANCE_SHARED_ROUTE,
    stubs: {
      asset: json(ASSET_LONG_OWNER),
      maintenanceRecords: json({
        maintenanceRecords: RECORDS_POPULATED.maintenanceRecords.map((r) => ({
          ...r,
          assetId: GENERATOR_ID,
        })),
      }),
      maintenanceTasks: json({
        maintenanceTasks: TASKS_POPULATED.maintenanceTasks.map((t) => ({
          ...t,
          assetId: GENERATOR_ID,
        })),
      }),
    },
    ready: async (page) => {
      await page.getByRole("heading", { name: "Generator" }).waitFor({ state: "visible" });
      await page
        .getByText(new RegExp(`Shared by ${DISPLAY_NAME_100}`))
        .first()
        .waitFor({ state: "visible" });
    },
  },

  // ── Team ───────────────────────────────────────────────────────────
  {
    id: "team/mutation-pending-create-team",
    category: "rendered",
    route: "/app/team",
    stubs: {
      teamsMe: json(TEAM_EMPTY),
      postTeam: pending(),
    },
    ready: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).click();
      await page.locator("#tm-name-input").fill("The Ortega Household");
      await page.getByRole("button", { name: "Create team" }).click();
      await page.getByRole("button", { name: /Creating/ }).waitFor({ state: "visible" });
    },
  },
  {
    id: "team/mutation-error-validation",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: json(TEAM_EMPTY) },
    ready: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).click();
      await page.getByRole("button", { name: "Create team" }).click();
      await page.getByText("Team name is required").waitFor({ state: "visible" });
    },
  },
  {
    id: "team/mutation-error-409-conflict",
    category: "rendered",
    route: "/app/team",
    stubs: {
      teamsMe: json(TEAM_EMPTY),
      postTeam: errStatus(409, "Already in a team"),
    },
    ready: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).click();
      await page.locator("#tm-name-input").fill("The Ortega Household");
      await page.getByRole("button", { name: "Create team" }).click();
      await page.getByText("You already belong to a team").waitFor({ state: "visible" });
    },
  },
  {
    id: "team/mutation-error-api",
    category: "rendered",
    route: "/app/team",
    stubs: {
      teamsMe: json(TEAM_EMPTY),
      postTeam: err500("Team write failed"),
    },
    ready: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).waitFor({ state: "visible" });
    },
    interact: async (page) => {
      await page.getByRole("button", { name: "Create a team" }).click();
      await page.locator("#tm-name-input").fill("The Ortega Household");
      await page.getByRole("button", { name: "Create team" }).click();
      await page.getByText("Team could not be created").waitFor({ state: "visible" });
    },
  },
  {
    id: "team/content-stress-long-team-name",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: json(TEAM_LONG_NAME) },
    ready: async (page) => {
      await page.getByText(TEAM_NAME_100).waitFor({ state: "visible" });
    },
  },
  {
    id: "team/content-stress-long-member-display-name",
    category: "rendered",
    route: "/app/team",
    stubs: { teamsMe: json(TEAM_LONG_MEMBER) },
    ready: async (page) => {
      await page.getByText(DISPLAY_NAME_100).waitFor({ state: "visible" });
    },
  },
];
