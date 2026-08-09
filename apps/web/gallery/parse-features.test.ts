import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { DEFAULT_FEATURE_SOURCES, parseFeatureFiles } from "./parse-features.ts";

const REPO_ROOT = join(import.meta.dirname, "../../..");

describe("parse live FEATURES.md", () => {
  it("yields unique ids and starts after the preamble", () => {
    const states = parseFeatureFiles(DEFAULT_FEATURE_SOURCES.map((p) => join(REPO_ROOT, p)));
    const ids = states.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(80);
    // Preamble has no ## so no states from conventions prose.
    expect(ids.every((id) => !id.startsWith("web-app-features"))).toBe(true);
    // Excluded markers: four unauthorized-401 (#195) + five shell states (#199).
    const excluded = states.filter((s) => s.marker?.kind === "excluded");
    expect(excluded).toHaveLength(9);
    expect(excluded.filter((s) => s.id.endsWith("/unauthorized-401"))).toHaveLength(4);
    expect(excluded.filter((s) => s.marker?.issue === 199)).toHaveLength(5);
  });
});
