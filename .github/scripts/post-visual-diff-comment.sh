#!/usr/bin/env bash
# Upsert the sticky visual-diff PR comment (#146).
#
# Env:
#   COMMENT_BODY_FILE  path to markdown
#   PR_NUMBER          pull request number
#   GITHUB_TOKEN       (provided by Actions)
set -euo pipefail

BODY_FILE="${COMMENT_BODY_FILE:?COMMENT_BODY_FILE required}"
PR_NUMBER="${PR_NUMBER:?PR_NUMBER required}"
MARKER="<!-- pineapple-web-visual-diff -->"

if [ ! -f "$BODY_FILE" ]; then
  echo "::error::comment body missing: $BODY_FILE"
  exit 1
fi

# Always mirror into the job summary (works on forks when PR write is denied).
{
  echo "## Web visual diff (job summary)"
  echo
  cat "$BODY_FILE"
} >>"${GITHUB_STEP_SUMMARY:-/dev/null}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "No GITHUB_TOKEN — skipped PR comment (summary only)."
  exit 0
fi

# Find existing sticky comment by marker.
existing_id="$(
  gh api "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
    --paginate \
    --jq ".[] | select(.body | contains(\"${MARKER}\")) | .id" \
    2>/dev/null | head -n1 || true
)"

if [ -n "$existing_id" ]; then
  echo "Updating comment ${existing_id}"
  gh api \
    --method PATCH \
    "repos/${GITHUB_REPOSITORY}/issues/comments/${existing_id}" \
    -f body="$(cat "$BODY_FILE")" \
    >/dev/null
else
  echo "Creating comment on PR #${PR_NUMBER}"
  gh api \
    --method POST \
    "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
    -f body="$(cat "$BODY_FILE")" \
    >/dev/null
fi
