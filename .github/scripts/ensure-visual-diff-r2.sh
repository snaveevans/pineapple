#!/usr/bin/env bash
# Idempotently provision the CI visual-diff R2 bucket (#146).
#
# wrangler deploy does not create R2 buckets (same class of gap as queues).
# Called from deploy.yml (IaC source of truth) and from the gallery CI job
# when same-repo secrets are available so the first PR can upload before merge.
#
# Prints:
#   public_base_url=<https://pub-….r2.dev>
# to stdout (and optionally appends public_base_url= to $GITHUB_OUTPUT).
set -euo pipefail

BUCKET="${VISUAL_DIFF_R2_BUCKET:-pineapple-visual-diff}"
RULE_NAME="${VISUAL_DIFF_R2_LIFECYCLE_RULE:-expire-ci-visual-diff-30d}"
EXPIRE_DAYS="${VISUAL_DIFF_R2_EXPIRE_DAYS:-30}"

# Prefer the web package's wrangler; fall back to api.
WRANGLER=(pnpm --filter @snaveevans/pineapple-web exec wrangler)
if ! pnpm --filter @snaveevans/pineapple-web exec wrangler --version >/dev/null 2>&1; then
  WRANGLER=(pnpm --filter @snaveevans/pineapple-api exec wrangler)
fi

echo "Ensuring R2 bucket ${BUCKET} exists"

if info="$("${WRANGLER[@]}" r2 bucket info "$BUCKET" 2>&1)"; then
  echo "Bucket ${BUCKET} already exists"
else
  if grep -qiE 'does not exist|not found|404' <<<"$info"; then
    echo "Creating bucket ${BUCKET}"
    "${WRANGLER[@]}" r2 bucket create "$BUCKET"
  else
    echo "::error::Unexpected error checking R2 bucket ${BUCKET}"
    echo "$info"
    exit 1
  fi
fi

echo "Ensuring public r2.dev URL is enabled"
if dev_url_out="$("${WRANGLER[@]}" r2 bucket dev-url get "$BUCKET" 2>&1)"; then
  if grep -qiE 'disabled|not enabled|status:\s*disabled' <<<"$dev_url_out"; then
    echo "Enabling r2.dev public access on ${BUCKET}"
    "${WRANGLER[@]}" r2 bucket dev-url enable "$BUCKET" -y
    dev_url_out="$("${WRANGLER[@]}" r2 bucket dev-url get "$BUCKET" 2>&1)"
  fi
else
  # get can fail when never enabled — try enable then re-get.
  echo "dev-url get failed; enabling"
  echo "$dev_url_out"
  "${WRANGLER[@]}" r2 bucket dev-url enable "$BUCKET" -y
  dev_url_out="$("${WRANGLER[@]}" r2 bucket dev-url get "$BUCKET" 2>&1)"
fi

# Extract https://pub-….r2.dev (with or without path).
PUBLIC_BASE="$(grep -oE 'https://pub-[a-zA-Z0-9.-]+\.r2\.dev' <<<"$dev_url_out" | head -n1 || true)"
if [ -z "$PUBLIC_BASE" ]; then
  echo "::error::Could not parse r2.dev public URL from wrangler output:"
  echo "$dev_url_out"
  exit 1
fi
echo "Public base URL: ${PUBLIC_BASE}"

echo "Ensuring lifecycle rule ${RULE_NAME} (expire ${EXPIRE_DAYS}d)"
if life="$("${WRANGLER[@]}" r2 bucket lifecycle list "$BUCKET" 2>&1)"; then
  if grep -q "$RULE_NAME" <<<"$life"; then
    echo "Lifecycle rule ${RULE_NAME} already present"
  else
    echo "Adding lifecycle rule ${RULE_NAME}"
    "${WRANGLER[@]}" r2 bucket lifecycle add "$BUCKET" "$RULE_NAME" \
      --expire-days "$EXPIRE_DAYS" -y
  fi
else
  echo "::warning::Could not list lifecycle rules; attempting add"
  echo "$life"
  "${WRANGLER[@]}" r2 bucket lifecycle add "$BUCKET" "$RULE_NAME" \
    --expire-days "$EXPIRE_DAYS" -y || true
fi

echo "public_base_url=${PUBLIC_BASE}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "public_base_url=${PUBLIC_BASE}" >>"$GITHUB_OUTPUT"
  echo "bucket=${BUCKET}" >>"$GITHUB_OUTPUT"
fi
