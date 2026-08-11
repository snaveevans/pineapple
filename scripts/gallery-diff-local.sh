#!/usr/bin/env bash
# Local visual diff for the web state gallery — merge-base vs HEAD.
#
# Wraps the two existing gallery CLIs (gallery:render, gallery:diff) so a
# frontend change can be proven visually clean before pushing, without
# waiting on CI. See docs/specs/cross-cutting/testing.md, "Visual diff
# against the base branch (#146)" for the threshold/reporting contract this
# mirrors, and .claude/skills/gallery-visual-diff/SKILL.md for how to read
# the output.
#
# The baseline render shares its worktree mechanics with CI's merge-base
# step via scripts/gallery-render-at-ref.sh; both it and the HEAD side here
# share the actual build+render pair via scripts/gallery-build-render.sh.
#
#   scripts/gallery-diff-local.sh [--refresh-base]
#
# Cost: ~8-12 minutes cold (two production builds + two ~150s renders + a
# pnpm install in a throwaway merge-base worktree). Every later run against
# the same merge-base reuses the cached baseline render and only rebuilds
# and re-renders HEAD — seconds, not minutes.
#
# Exit 0 whenever the run completed, whether or not visual changes were
# found — a changed state is information, not a script failure. Non-zero
# means a genuine failure: relevance-gate git plumbing, build, render, or
# worktree setup broke.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REFRESH_BASE=0
for arg in "$@"; do
  case "$arg" in
    --refresh-base)
      REFRESH_BASE=1
      ;;
    -h | --help)
      echo "Usage: scripts/gallery-diff-local.sh [--refresh-base]"
      echo "  --refresh-base   discard the cached merge-base render and rebuild it"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/pineapple-gallery"
RUN_DIR="$CACHE_ROOT/runs/latest"
HEAD_OUT="$RUN_DIR/head"
DIFF_OUT="$RUN_DIR/diff"

log() { echo "==> $*"; }

log "Fetching origin/main..."
if ! git fetch --quiet origin main; then
  echo "warning: could not fetch origin/main — using local ref, merge-base may be stale" >&2
fi

MERGE_BASE="$(git merge-base HEAD origin/main)"
log "merge-base: $MERGE_BASE"

# Relevance gate FIRST — a full run is ~8-12 minutes; never spend that on a
# PR that touches no rendered surface.
if git diff --quiet "$MERGE_BASE" -- apps/web/src apps/web/gallery; then
  log "No changes under apps/web/src/** or apps/web/gallery/** since merge-base — visual diff skipped."
  exit 0
fi

log "apps/web/src or apps/web/gallery changed since merge-base — running visual diff."

BASE_CACHE_DIR="$CACHE_ROOT/$MERGE_BASE"
BASE_OUT="$BASE_CACHE_DIR/out"

if [ "$REFRESH_BASE" -eq 1 ] && [ -d "$BASE_CACHE_DIR" ]; then
  log "--refresh-base: discarding cached baseline at $BASE_CACHE_DIR"
  rm -rf "$BASE_CACHE_DIR"
fi

if [ -d "$BASE_OUT" ] && [ -f "$BASE_OUT/manifest.json" ]; then
  log "Baseline cache HIT for $MERGE_BASE — reusing $BASE_OUT"
  BASE_TIMING="cached"
else
  log "Baseline cache MISS for $MERGE_BASE — rendering into a detached worktree"
  T_BASE_START=$(date +%s)
  # Never `git checkout` — this leaves HEAD's working tree, branch, and
  # node_modules untouched. Worktree path is deterministic (keyed on the
  # merge-base) so a killed run's residue is easy to spot and is cleared on
  # the next attempt regardless.
  bash "$REPO_ROOT/scripts/gallery-render-at-ref.sh" \
    "$MERGE_BASE" "$BASE_OUT" "$CACHE_ROOT/worktrees/$MERGE_BASE"
  BASE_TIMING="$(($(date +%s) - T_BASE_START))s"
fi

log "Building and rendering HEAD (production)..."
T_HEAD_START=$(date +%s)
mkdir -p "$RUN_DIR"
bash "$REPO_ROOT/scripts/gallery-build-render.sh" "$HEAD_OUT"
HEAD_TIMING="$(($(date +%s) - T_HEAD_START))s"

log "Diffing merge-base vs HEAD..."
T_DIFF_START=$(date +%s)
pnpm --filter @snaveevans/pineapple-web gallery:diff -- \
  --base "$BASE_OUT" \
  --head "$HEAD_OUT" \
  --out "$DIFF_OUT"
DIFF_TIMING="$(($(date +%s) - T_DIFF_START))s"

SUMMARY_JSON="$DIFF_OUT/summary.json" node --input-type=module -e '
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(process.env.SUMMARY_JSON, "utf8"));
const changed = s.entries.filter((e) => e.status !== "unchanged");
console.log("");
console.log("== gallery-diff-local summary ==");
console.log(
  `compared=${s.totalCompared} changed=${s.changedCount} added=${s.addedCount} ` +
  `removed=${s.removedCount} resized=${s.resizedCount} unchanged=${s.unchangedCount}`,
);
if (changed.length === 0) {
  console.log("No visually changed states.");
} else {
  console.log("");
  console.log("Changed screen/state/viewport triples:");
  for (const e of changed) {
    console.log(`  ${e.status}\t${e.diffPixels}px\t${e.id}\t${e.viewport}`);
  }
}
'

echo ""
log "Diff PNGs: $DIFF_OUT (base/ head/ diff/ subfolders, summary.json)"
log "timing: base=${BASE_TIMING} head=${HEAD_TIMING} diff=${DIFF_TIMING}"
