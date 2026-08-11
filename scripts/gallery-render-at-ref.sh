#!/usr/bin/env bash
# Render the state gallery at an arbitrary git ref without disturbing the
# current working tree, branch, or node_modules.
#
# Checks the ref out into a detached `git worktree` (never `git checkout`),
# installs its dependencies, and builds+renders via gallery-build-render.sh.
# Shared by CI's merge-base render step and scripts/gallery-diff-local.sh's
# cached baseline render, so the worktree mechanics live in exactly one
# place instead of two copies drifting apart.
#
#   scripts/gallery-render-at-ref.sh <ref> <out-dir> [<worktree-dir>]
#
# <out-dir> must be an absolute path: it's written to *after* cd-ing into
# the worktree, so a relative path would resolve inside the throwaway tree
# and vanish with it on cleanup.
# <worktree-dir> defaults to a fresh temp dir. If given, any existing
# content at that path is discarded first — callers that pass one (e.g. a
# cache-keyed path) own that path and expect a clean checkout, not a reused
# stale one. The worktree is always removed on exit — success, error, or
# interrupt — so no run leaves one behind.
set -euo pipefail

REF="${1:?usage: gallery-render-at-ref.sh <ref> <out-dir> [<worktree-dir>]}"
OUT_DIR="${2:?usage: gallery-render-at-ref.sh <ref> <out-dir> [<worktree-dir>]}"
CUSTOM_WORKTREE_DIR="${3:-}"

case "$OUT_DIR" in
  /*) ;;
  *)
    echo "gallery-render-at-ref.sh: <out-dir> must be absolute, got: $OUT_DIR" >&2
    exit 2
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Residue from a prior run killed hard enough to skip the trap below.
git worktree prune >/dev/null 2>&1 || true

if [ -n "$CUSTOM_WORKTREE_DIR" ]; then
  WORKTREE_DIR="$CUSTOM_WORKTREE_DIR"
  rm -rf "$WORKTREE_DIR"
  mkdir -p "$(dirname "$WORKTREE_DIR")"
else
  WORKTREE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pineapple-gallery-ref.XXXXXX")"
  rmdir "$WORKTREE_DIR" # git worktree add wants a path that doesn't exist yet
fi

cleanup() {
  if [ -d "$WORKTREE_DIR" ]; then
    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE_DIR" "$REF"

(
  cd "$WORKTREE_DIR"
  # Skip the postinstall Chromium fetch — the browser cache is shared by
  # path (PLAYWRIGHT_BROWSERS_PATH, or Playwright's default user cache),
  # not per-worktree, and is already populated from the main checkout.
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile
  bash "$REPO_ROOT/scripts/gallery-build-render.sh" "$OUT_DIR"
)
