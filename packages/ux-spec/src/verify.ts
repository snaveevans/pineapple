import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ScreenSpec, copyText, type StateSpec } from "./schema.ts";

// Conformance check: every copy string the spec declares must actually appear
// in the implementation it names. This is the half that `git diff --exit-code`
// cannot do — the spec asserting something about the code, not about itself.
//
// Parameterised copy ("No {category} yet") is checked segment-by-segment, since
// the implementation interpolates the value.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const uxJson = join(repoRoot, "packages", "ux-spec", "generated", "ux.json");

const MIN_SEGMENT = 3;

function staticSegments(text: string): string[] {
  return text
    .split(/\{[a-zA-Z0-9_]+\}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= MIN_SEGMENT);
}

function checkState(
  state: StateSpec,
  source: string,
  sourcePath: string,
  screenId: string,
): string[] {
  const failures: string[] = [];
  for (const [key, value] of Object.entries(state.copy)) {
    const text = copyText(value);
    for (const segment of staticSegments(text)) {
      if (!source.includes(segment)) {
        failures.push(
          `${screenId}.${state.id}.${key}: ${JSON.stringify(segment)} not found in ${sourcePath}`,
        );
      }
    }
  }

  for (const action of state.actions) {
    if (!source.includes(action.label)) {
      failures.push(
        `${screenId}.${state.id}.action.${action.id}: ${JSON.stringify(action.label)} not found in ${sourcePath}`,
      );
    }
  }

  return failures;
}

const parsed: unknown = JSON.parse(readFileSync(uxJson, "utf8"));
const screens = ScreenSpec.array().parse((parsed as { screens: unknown[] }).screens);

const failures: string[] = [];
let checked = 0;

for (const screen of screens) {
  for (const [platform, impl] of Object.entries(screen.implementations)) {
    const sourcePath = impl.source;
    const source = readFileSync(join(repoRoot, sourcePath), "utf8");
    for (const state of screen.states) {
      failures.push(...checkState(state, source, sourcePath, `${screen.id}[${platform}]`));
      checked += Object.keys(state.copy).length + state.actions.length;
    }
  }
}

if (failures.length > 0) {
  console.error(`ux-spec: ${failures.length} conformance failure(s)\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("");
  process.exit(1);
}

console.log(`ux-spec: ${checked} copy string(s) verified against their implementations`);
