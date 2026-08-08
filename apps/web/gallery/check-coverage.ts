import type { ParsedFeatureState } from "./parse-features.ts";
import type { RegistryEntry } from "./registry.ts";

/** Compare FEATURES-derived ids to the hand-authored registry. */
export function checkCoverage(
  featureStates: ReadonlyArray<ParsedFeatureState>,
  registry: ReadonlyArray<RegistryEntry>,
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
