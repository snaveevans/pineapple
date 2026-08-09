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

  it("does not synthesize deferred entries — registry is hand-authored", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry = registryEntries();
    // A FEATURES id with no static entry is missing, not auto-filled.
    const withoutOne = registry.filter((e) => e.id !== "marketing-home/unauthenticated");
    expect(checkCoverage(features, withoutOne).some((e) => e.includes("no registry entry"))).toBe(
      true,
    );
  });

  it("renders the exhaustive slice-1+2 read-state set", () => {
    expect(renderedStates()).toHaveLength(61);
    const ids = renderedStates()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual([
      "activity-history/empty-filtered",
      "activity-history/empty-no-account-history",
      "activity-history/error",
      "activity-history/loading",
      "activity-history/populated",
      "activity-history/populated-filtered",
      "activity-history/populated-paginated",
      "add-asset/idle-equipment-type",
      "add-asset/idle-property-type",
      "add-asset/idle-vehicle-type",
      "app-search/closed",
      "app-search/empty-no-matches",
      "app-search/error",
      "app-search/loading",
      "app-search/open-idle-empty-query",
      "app-search/populated",
      "asset-library/empty-filtered",
      "asset-library/empty-no-assets-owned",
      "asset-library/error",
      "asset-library/loading",
      "asset-library/populated",
      "asset-library/populated-filtered",
      "asset-maintenance-records-and-tasks/empty-no-records",
      "asset-maintenance-records-and-tasks/empty-no-tasks",
      "asset-maintenance-records-and-tasks/error-forbidden-403",
      "asset-maintenance-records-and-tasks/error-load-failure",
      "asset-maintenance-records-and-tasks/error-not-found-404",
      "asset-maintenance-records-and-tasks/loading",
      "asset-maintenance-records-and-tasks/populated",
      "asset-maintenance-records-and-tasks/populated-shared-by-teammate",
      "authenticated-app-shell/active-route",
      "authenticated-app-shell/desktop",
      "authenticated-app-shell/populated-notifications-has-unread",
      "authenticated-app-shell/populated-notifications-zero-unread",
      "authenticated-app-shell/populated-profile",
      "dashboard-home/empty-empty-fleet",
      "dashboard-home/empty-filtered",
      "dashboard-home/empty-no-scheduled-tasks",
      "dashboard-home/error",
      "dashboard-home/loading",
      "dashboard-home/populated",
      "marketing-home/authenticated",
      "marketing-home/unauthenticated",
      "notifications/empty",
      "notifications/error",
      "notifications/loading",
      "notifications/populated",
      "notifications/populated-paginated",
      "sign-in/error",
      "sign-in/idle",
      "sign-in/in-flight",
      "team/empty-no-team",
      "team/error",
      "team/form-create-team",
      "team/loading",
      "team/populated-has-team",
      "user-profile-and-onboarding/error",
      "user-profile-and-onboarding/loading",
      "user-profile-and-onboarding/populated-incomplete-onboarding-no-provider-name",
      "user-profile-and-onboarding/populated-incomplete-onboarding-provider-name-available",
      "user-profile-and-onboarding/populated-profile-edit",
    ]);
    expect(registryEntries().filter((e) => e.category === "deferred" && e.issue === 192)).toEqual(
      [],
    );
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
    // Real path: hand-authored registry missing an id (no completeRegistry synthesis).
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
        category: "deferred",
        issue: 192,
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
            category: "deferred" as const,
            issue: 195,
            reason: "wrong on purpose",
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
          e.includes("deferred"),
      ),
    ).toBe(true);
  });
});
