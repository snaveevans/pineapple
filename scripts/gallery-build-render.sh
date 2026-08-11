#!/usr/bin/env bash
# Build the web app for production and render the state gallery into a dir.
#
# The one place "build + render" is spelled out — shared by CI
# (.github/workflows/ci.yml, HEAD side) and the local tooling
# (scripts/gallery-diff-local.sh, scripts/gallery-render-at-ref.sh) so the
# two commands don't drift out of sync across callers.
#
#   scripts/gallery-build-render.sh <out-dir>
#
# <out-dir> is passed straight to `gallery:render -- --out`; render.ts
# resolves a relative path against the repo root regardless of cwd, and
# takes an absolute path unchanged — pass whichever the caller has.
set -euo pipefail

OUT_DIR="${1:?usage: gallery-build-render.sh <out-dir>}"

pnpm --filter @snaveevans/pineapple-web build
TZ=UTC pnpm --filter @snaveevans/pineapple-web gallery:render -- --out "$OUT_DIR"
