#!/usr/bin/env bash
# Upload changed gallery diff assets to R2 under a commit-scoped prefix (#146).
#
# Env:
#   VISUAL_DIFF_R2_BUCKET   (default pineapple-visual-diff)
#   VISUAL_DIFF_PREFIX      required — e.g. pr/42/abc1234deadbeef
#   VISUAL_DIFF_DIR         required — apps/web/gallery/out-diff
#
# Only uploads base/, head/, and diff/ trees (the delta). Skips summary/comment.
set -euo pipefail

BUCKET="${VISUAL_DIFF_R2_BUCKET:-pineapple-visual-diff}"
PREFIX="${VISUAL_DIFF_PREFIX:?VISUAL_DIFF_PREFIX required}"
DIR="${VISUAL_DIFF_DIR:?VISUAL_DIFF_DIR required}"

WRANGLER=(pnpm --filter @snaveevans/pineapple-web exec wrangler)

if [ ! -d "$DIR" ]; then
  echo "::error::diff dir missing: $DIR"
  exit 1
fi

shopt -s nullglob
files=()
for sub in base head diff; do
  if [ -d "$DIR/$sub" ]; then
    for f in "$DIR/$sub"/*; do
      [ -f "$f" ] || continue
      files+=("$f")
    done
  fi
done

if [ "${#files[@]}" -eq 0 ]; then
  echo "No delta images to upload (zero visual change)."
  exit 0
fi

echo "Uploading ${#files[@]} objects to r2://${BUCKET}/${PREFIX}/"
for f in "${files[@]}"; do
  rel="${f#"$DIR"/}"
  key="${PREFIX}/${rel}"
  echo "  put ${key}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$f" \
    --remote \
    --content-type image/png \
    --cache-control "public, max-age=31536000, immutable" \
    -y
done

echo "uploaded=${#files[@]}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "uploaded=${#files[@]}" >>"$GITHUB_OUTPUT"
fi
