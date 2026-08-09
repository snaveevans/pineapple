import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { checkCoverage } from "./check-coverage.ts";
import {
  DEFAULT_FEATURE_SOURCES,
  parseFeatureFiles,
  parseFeaturesMarkdown,
  toKebabState,
} from "./parse-features.ts";
import {
  assertRegistryInvariants,
  registryEntries,
  renderedStates,
  type RegistryEntry,
} from "./registry.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");

function featurePaths(): string[] {
  return DEFAULT_FEATURE_SOURCES.map((p) => join(REPO_ROOT, p));
}

describe("FEATURES.md state id derivation", () => {
  it("strips gallery markers and keeps unauthorized-401", () => {
    const md = `## Asset Library

**States:**

- \`unauthorized\` (401) — \`[gallery:excluded #195]\` spinner then navigates
- \`empty\` (filtered) — selected category has no matching assets
`;
    const states = parseFeaturesMarkdown(md, "fixture.md");
    expect(states.map((s) => s.id)).toEqual([
      "asset-library/unauthorized-401",
      "asset-library/empty-filtered",
    ]);
    expect(states[0]?.marker).toEqual({ kind: "excluded", issue: 195 });
    expect(states[0]?.id.includes("gallery")).toBe(false);
  });

  it("prefixes non-States blocks and parses inline prose blocks", () => {
    const md = `## Dashboard (Home)

**States:**

- \`loading\` — fetches dashboard

**Mutations:**

- \`pending\` (create team) — disabled
- \`error\` — inline

**Add-service drawer nested states** (on demand):

- \`loading\` — loading assets
- \`error\` — could not load

**Content stress:** long asset name; long task title

**Notice states (local UI, not async):** saved ("ok") · removed ("gone")

**Contact-email value sub-states:** unset (empty) · verified (badge)
`;
    const states = parseFeaturesMarkdown(md, "fixture.md");
    const ids = states.map((s) => s.id);
    expect(ids).toContain("dashboard-home/loading");
    expect(ids).toContain("dashboard-home/mutation-pending-create-team");
    expect(ids).toContain("dashboard-home/mutation-error");
    expect(ids).toContain("dashboard-home/add-service-drawer-loading");
    expect(ids).toContain("dashboard-home/add-service-drawer-error");
    expect(ids).toContain("dashboard-home/content-stress-long-asset-name");
    expect(ids).toContain("dashboard-home/notice-saved");
    expect(ids).toContain("dashboard-home/contact-email-unset");
  });

  it("fails loudly on an unrecognised block", () => {
    const md = `## Widget

**Mystery block:**

- something — yep
`;
    expect(() => parseFeaturesMarkdown(md, "fixture.md")).toThrow(/unrecognised FEATURES block/);
  });

  it("kebab helper strips backticks and parentheses chars", () => {
    expect(toKebabState("`unauthorized` (401)")).toBe("unauthorized-401");
    expect(toKebabState("`empty` (filtered)")).toBe("empty-filtered");
  });
});

describe("gallery coverage check", () => {
  it("every FEATURES state is registered; every registry id exists in FEATURES", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry = registryEntries();
    assertRegistryInvariants(registry);
    const errors = checkCoverage(features, registry);
    expect(errors).toEqual([]);
  });

  it("does not synthesize registry entries — missing FEATURES ids fail coverage", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry = registryEntries();
    const withoutOne = registry.filter((e) => e.id !== "marketing-home/unauthenticated");
    expect(checkCoverage(features, withoutOne).some((e) => e.includes("no registry entry"))).toBe(
      true,
    );
  });

  it("renders the full gallery (slices 1–3) with no deferred hatch", () => {
    expect(renderedStates()).toHaveLength(120);
    expect(
      registryEntries().every((e) => e.category === "rendered" || e.category === "excluded"),
    ).toBe(true);
    const ids = renderedStates()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual([
      "activity-history/content-stress-collection-at-pagination-boundary",
      "activity-history/content-stress-long-action-title",
      "activity-history/content-stress-long-asset-name-in-entries",
      "activity-history/content-stress-long-teammate-display-name-in-actor-attribution",
      "activity-history/empty-filtered",
      "activity-history/empty-no-account-history",
      "activity-history/error",
      "activity-history/loading",
      "activity-history/populated",
      "activity-history/populated-filtered",
      "activity-history/populated-paginated",
      "add-asset/content-stress-long-asset-name",
      "add-asset/content-stress-long-property-address",
      "add-asset/idle-equipment-type",
      "add-asset/idle-property-type",
      "add-asset/idle-vehicle-type",
      "add-asset/mutation-error-api",
      "add-asset/mutation-error-client-validation",
      "add-asset/mutation-pending",
      "app-search/closed",
      "app-search/content-stress-long-asset-name-in-result-rows",
      "app-search/content-stress-long-owner-display-name-in-sharing-badge",
      "app-search/content-stress-long-summary-line",
      "app-search/empty-no-matches",
      "app-search/error",
      "app-search/loading",
      "app-search/open-idle-empty-query",
      "app-search/populated",
      "asset-library/content-stress-long-asset-name-on-cards",
      "asset-library/content-stress-long-owner-display-name-in-sharing-badge",
      "asset-library/content-stress-long-property-address-in-property-card-summaries",
      "asset-library/empty-filtered",
      "asset-library/empty-no-assets-owned",
      "asset-library/error",
      "asset-library/loading",
      "asset-library/populated",
      "asset-library/populated-filtered",
      "asset-maintenance-records-and-tasks/content-stress-long-asset-name-in-header",
      "asset-maintenance-records-and-tasks/content-stress-long-owner-display-name-in-sharing-badge",
      "asset-maintenance-records-and-tasks/content-stress-long-record-description",
      "asset-maintenance-records-and-tasks/content-stress-long-task-title",
      "asset-maintenance-records-and-tasks/empty-no-records",
      "asset-maintenance-records-and-tasks/empty-no-tasks",
      "asset-maintenance-records-and-tasks/error-forbidden-403",
      "asset-maintenance-records-and-tasks/error-load-failure",
      "asset-maintenance-records-and-tasks/error-not-found-404",
      "asset-maintenance-records-and-tasks/loading",
      "asset-maintenance-records-and-tasks/local-delete-task-confirm",
      "asset-maintenance-records-and-tasks/mutation-error",
      "asset-maintenance-records-and-tasks/mutation-pending-create-record",
      "asset-maintenance-records-and-tasks/mutation-pending-create-task",
      "asset-maintenance-records-and-tasks/mutation-pending-share-unshare-owner-only",
      "asset-maintenance-records-and-tasks/populated",
      "asset-maintenance-records-and-tasks/populated-shared-by-teammate",
      "authenticated-app-shell/active-route",
      "authenticated-app-shell/desktop",
      "authenticated-app-shell/populated-notifications-has-unread",
      "authenticated-app-shell/populated-notifications-zero-unread",
      "authenticated-app-shell/populated-profile",
      "dashboard-home/add-service-drawer-empty",
      "dashboard-home/add-service-drawer-error",
      "dashboard-home/add-service-drawer-loading",
      "dashboard-home/content-stress-long-asset-name-in-queue-rows-and-detail-card",
      "dashboard-home/content-stress-long-owner-display-name-in-sharing-badge",
      "dashboard-home/content-stress-long-task-title",
      "dashboard-home/empty-empty-fleet",
      "dashboard-home/empty-filtered",
      "dashboard-home/empty-no-scheduled-tasks",
      "dashboard-home/error",
      "dashboard-home/loading",
      "dashboard-home/mutation-error",
      "dashboard-home/mutation-pending-add-service",
      "dashboard-home/mutation-pending-mark-complete",
      "dashboard-home/populated",
      "marketing-home/authenticated",
      "marketing-home/unauthenticated",
      "notifications/content-stress-collection-at-pagination-boundary",
      "notifications/content-stress-long-asset-name-in-notification-rows",
      "notifications/content-stress-long-task-title",
      "notifications/empty",
      "notifications/error",
      "notifications/loading",
      "notifications/mutation-error",
      "notifications/mutation-pending-mark-all-read",
      "notifications/mutation-pending-mark-one-read",
      "notifications/populated",
      "notifications/populated-paginated",
      "sign-in/error",
      "sign-in/idle",
      "sign-in/in-flight",
      "team/content-stress-long-member-display-name",
      "team/content-stress-long-team-name",
      "team/empty-no-team",
      "team/error",
      "team/form-create-team",
      "team/loading",
      "team/mutation-error-409-conflict",
      "team/mutation-error-api",
      "team/mutation-error-validation",
      "team/mutation-pending-create-team",
      "team/populated-has-team",
      "user-profile-and-onboarding/contact-email-unset",
      "user-profile-and-onboarding/contact-email-unverified",
      "user-profile-and-onboarding/contact-email-verified",
      "user-profile-and-onboarding/content-stress-long-contact-email-address",
      "user-profile-and-onboarding/content-stress-maximum-length-display-name",
      "user-profile-and-onboarding/error",
      "user-profile-and-onboarding/loading",
      "user-profile-and-onboarding/mutation-error",
      "user-profile-and-onboarding/mutation-pending-patch-api-users-me-display-name",
      "user-profile-and-onboarding/mutation-pending-remove-contact-email-delete-api-users-me-notification-email",
      "user-profile-and-onboarding/mutation-pending-resend-verification-post-api-users-me-notification-email-verification",
      "user-profile-and-onboarding/mutation-pending-set-contact-email-put-api-users-me-notification-email",
      "user-profile-and-onboarding/notice-cooldown",
      "user-profile-and-onboarding/notice-removed",
      "user-profile-and-onboarding/notice-saved",
      "user-profile-and-onboarding/notice-verification-sent",
      "user-profile-and-onboarding/populated-incomplete-onboarding-no-provider-name",
      "user-profile-and-onboarding/populated-incomplete-onboarding-provider-name-available",
      "user-profile-and-onboarding/populated-profile-edit",
    ]);
  });

  it("excludes 401 redirects (#195) and unreachable/identical shell states (#199)", () => {
    const excluded = registryEntries().filter((e) => e.category === "excluded");
    expect(excluded.map((e) => e.id).sort()).toEqual([
      "activity-history/unauthorized-401",
      "asset-library/unauthorized-401",
      "authenticated-app-shell/error-notifications",
      "authenticated-app-shell/error-profile",
      "authenticated-app-shell/loading-notifications",
      "authenticated-app-shell/loading-profile",
      "authenticated-app-shell/mobile",
      "notifications/unauthorized-401",
      "team/unauthorized-401",
    ]);
    for (const e of excluded) {
      if (e.category !== "excluded") throw new Error("unreachable");
      expect([195, 199]).toContain(e.issue);
    }
  });

  it("FAILS when a FEATURES state has no registry entry", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry = registryEntries().filter((e) => e.id !== "asset-library/loading");
    const errors = checkCoverage(features, registry);
    expect(
      errors.some((e) => e.includes("asset-library/loading") && e.includes("no registry")),
    ).toBe(true);
  });

  it("FAILS when a registry entry names a missing FEATURES id", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry: RegistryEntry[] = [
      ...registryEntries(),
      {
        id: "asset-library/does-not-exist",
        category: "excluded",
        issue: 193,
        reason: "orphan",
      },
    ];
    const errors = checkCoverage(features, registry);
    expect(errors.some((e) => e.includes("asset-library/does-not-exist"))).toBe(true);
  });

  it("FAILS when a gallery marker disagrees with the registry category", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry = registryEntries().map((e) =>
      e.id === "asset-library/unauthorized-401"
        ? {
            id: e.id,
            category: "rendered" as const,
            route: "/app/assets",
            stubs: {},
            ready: async () => {},
          }
        : e,
    );
    const errors = checkCoverage(features, registry);
    expect(
      errors.some(
        (e) =>
          e.includes("asset-library/unauthorized-401") &&
          e.includes("disagrees") &&
          e.includes("excluded") &&
          e.includes("rendered"),
      ),
    ).toBe(true);
  });
});
