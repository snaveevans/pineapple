#!/usr/bin/env bash
# PR diff-size budget check — encodes CLAUDE.md "Scope discipline" as a gate
# (issue #88): ~40 files / ~800 net lines is the signal to stop and split a
# branch. Advisory prose had already been blown once (a 56-file/2443-line PR)
# before this existed.
#
# Usage:
#   .github/scripts/pr-diff-size-budget.sh <base-ref> [<head-ref>]
#
#   <base-ref>  ref to diff against (e.g. origin/main). Required.
#   <head-ref>  ref to diff from base to. Defaults to HEAD.
#
# Diffs against the merge-base of the two refs (matches what GitHub's Files
# Changed tab shows), counting net changed lines (insertions + deletions) and
# changed-file count. Generated/lockfile paths that a legitimate regen
# touches are excluded from both counts. Exits 1 with an ::error:: pointing
# at CLAUDE.md when either budget is exceeded; exits 0 otherwise.
#
# Fails closed: if the merge-base or the diff itself can't be computed
# (e.g. the caller didn't fetch enough history), this exits 1 rather than
# silently reporting zero change.
set -euo pipefail

BASE_REF="${1:?usage: pr-diff-size-budget.sh <base-ref> [<head-ref>]}"
HEAD_REF="${2:-HEAD}"

# Overridable for the selftest; production always uses the CLAUDE.md budget.
MAX_LINES="${PR_DIFF_SIZE_MAX_LINES:-800}"
MAX_FILES="${PR_DIFF_SIZE_MAX_FILES:-40}"

# Generated/committed artifacts a legitimate regen touches (see CLAUDE.md
# "API documentation is generated" and "cf-typegen") plus the lockfile. Keep
# in sync: a new generated artifact should be added here too.
EXCLUDE_RE='^(pnpm-lock\.yaml|docs/reference/openapi\.json|apps/web/src/api/schema\.ts|apps/api/worker-configuration\.d\.ts)$'

MERGE_BASE="$(git merge-base "$BASE_REF" "$HEAD_REF")" || {
  echo "::error::Could not determine merge-base of $BASE_REF and $HEAD_REF — failing closed (fetch enough history to compute it)" >&2
  exit 1
}

# Diff to a file rather than piping into the read loop: a failure inside a
# pipe under `set -e` doesn't fail the script (only the loop's exit status
# would), which would silently report zero files/lines instead of failing
# closed.
numstat_file="$(mktemp)"
trap 'rm -f "$numstat_file"' EXIT
if ! git diff --numstat "$MERGE_BASE" "$HEAD_REF" -- >"$numstat_file"; then
  echo "::error::git diff --numstat failed — failing closed" >&2
  exit 1
fi

files=0
lines=0
while IFS=$'\t' read -r added deleted path; do
  [ -z "$path" ] && continue
  if [[ "$path" =~ $EXCLUDE_RE ]]; then
    continue
  fi
  files=$((files + 1))
  # Binary files report `-` for added/deleted in --numstat; no line count to add.
  if [ "$added" != "-" ]; then
    lines=$((lines + added + deleted))
  fi
done <"$numstat_file"

echo "files=$files"
echo "lines=$lines"

over=0
if [ "$lines" -gt "$MAX_LINES" ]; then
  echo "::error::PR changes $lines lines (budget: $MAX_LINES)" >&2
  over=1
fi
if [ "$files" -gt "$MAX_FILES" ]; then
  echo "::error::PR touches $files files (budget: $MAX_FILES)" >&2
  over=1
fi

if [ "$over" -eq 1 ]; then
  echo "::error::PR exceeds the scope-discipline budget (CLAUDE.md § Scope discipline: ~40 files / ~800 net lines). Split this branch, or apply the 'large-diff' label if this is a genuinely defended cross-cutting change." >&2
  exit 1
fi

echo "PR within scope-discipline budget ($files files, $lines lines)"
