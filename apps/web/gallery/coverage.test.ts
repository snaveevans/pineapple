import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  DEFAULT_FEATURE_SOURCES,
  parseFeatureFiles,
  parseFeaturesMarkdown,
  toKebabState,
} from "./parse-features.ts";
import {
  assertRegistryInvariants,
  completeRegistry,
  renderedStates,
  staticRegistryEntries,
  type RegistryEntry,
} from "./registry.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");

function featurePaths(): string[] {
  return DEFAULT_FEATURE_SOURCES.map((p) => join(REPO_ROOT, p));
}

function checkCoverage(
  featureStates: ReturnType<typeof parseFeatureFiles>,
  registry: RegistryEntry[],
): string[] {
  const errors: string[] = [];
  const byId = new Map(registry.map((e) => [e.id, e]));
  const featureIds = new Set(featureStates.map((s) => s.id));

  for (const f of featureStates) {
    const entry = byId.get(f.id);
    if (entry === undefined) {
      errors.push(`FEATURES state ${f.id} has no registry entry`);
      continue;
    }
    if (f.marker !== null && entry.category !== f.marker.kind) {
      errors.push(
        `${f.id}: FEATURES marker [gallery:${f.marker.kind} #${f.marker.issue}] disagrees with registry category ${entry.category}`,
      );
    }
    if (entry.category === "deferred" || entry.category === "excluded") {
      if (!Number.isInteger(entry.issue) || entry.issue <= 0) {
        errors.push(`${f.id}: ${entry.category} entry missing issue number`);
      }
    }
  }

  for (const e of registry) {
    if (!featureIds.has(e.id)) {
      errors.push(`registry entry ${e.id} matches no FEATURES.md state`);
    }
  }

  return errors;
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
    const registry = completeRegistry(features);
    assertRegistryInvariants(registry);
    const errors = checkCoverage(features, registry);
    expect(errors).toEqual([]);
  });

  it("renders exactly 23 read states from the four fixture screens", () => {
    expect(renderedStates()).toHaveLength(23);
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
      "asset-library/empty-filtered",
      "asset-library/empty-no-assets-owned",
      "asset-library/error",
      "asset-library/loading",
      "asset-library/populated",
      "asset-library/populated-filtered",
      "notifications/empty",
      "notifications/error",
      "notifications/loading",
      "notifications/populated",
      "notifications/populated-paginated",
      "team/empty-no-team",
      "team/error",
      "team/form-create-team",
      "team/loading",
      "team/populated-has-team",
    ]);
  });

  it("four unauthorized-401 states are excluded via #195", () => {
    const excluded = staticRegistryEntries().filter((e) => e.category === "excluded");
    expect(excluded.map((e) => e.id).sort()).toEqual([
      "activity-history/unauthorized-401",
      "asset-library/unauthorized-401",
      "notifications/unauthorized-401",
      "team/unauthorized-401",
    ]);
    for (const e of excluded) {
      if (e.category !== "excluded") throw new Error("unreachable");
      expect(e.issue).toBe(195);
    }
  });

  it("FAILS when a FEATURES state has no registry entry", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry = completeRegistry(features).filter((e) => e.id !== "asset-library/loading");
    const errors = checkCoverage(features, registry);
    expect(
      errors.some((e) => e.includes("asset-library/loading") && e.includes("no registry")),
    ).toBe(true);
  });

  it("FAILS when a registry entry names a missing FEATURES id", () => {
    const features = parseFeatureFiles(featurePaths());
    const registry: RegistryEntry[] = [
      ...completeRegistry(features),
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
    const registry = completeRegistry(features).map((e) =>
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
