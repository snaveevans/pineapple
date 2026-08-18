#!/usr/bin/env bash
# Self-test for pr-diff-size-budget.sh (issue #88).
# Run from repo root: .github/scripts/pr-diff-size-budget.selftest.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/.github/scripts/pr-diff-size-budget.sh"
fail=0

fixture="$(mktemp -d)"
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT

# The script resolves refs via plain `git` (no -C), so every invocation
# under test must run with the fixture repo as CWD.
in_fixture() (
  cd "$fixture"
  "$@"
)

assert_pass() {
  local label="$1"
  shift
  local out
  if out="$(in_fixture "$@" 2>&1)"; then
    echo "ok  pass: $label"
  else
    echo "FAIL pass: $label (expected exit 0)" >&2
    echo "$out" >&2
    fail=1
  fi
}

assert_fail() {
  local label="$1"
  shift
  local out
  if out="$(in_fixture "$@" 2>&1)"; then
    echo "FAIL fail: $label (expected nonzero exit)" >&2
    echo "$out" >&2
    fail=1
  else
    echo "ok  fail: $label"
  fi
}

# Defaults must match CLAUDE.md "Scope discipline" (~40 files / ~800 net
# lines) — a static check so a refactor of the script can't silently drift
# the budget it enforces.
if grep -q 'MAX_LINES="${PR_DIFF_SIZE_MAX_LINES:-800}"' "$SCRIPT" &&
  grep -q 'MAX_FILES="${PR_DIFF_SIZE_MAX_FILES:-40}"' "$SCRIPT"; then
  echo "ok  defaults match CLAUDE.md (800 lines / 40 files)"
else
  echo "FAIL default budget in script no longer matches CLAUDE.md (800/40)" >&2
  fail=1
fi

git -C "$fixture" init -q
git -C "$fixture" config user.email "selftest@example.com"
git -C "$fixture" config user.name "selftest"
git -C "$fixture" config commit.gpgsign false

mkdir -p "$fixture/apps/web/src/api" "$fixture/docs/reference" "$fixture/apps/api"
echo "base" >"$fixture/apps/web/src/App.tsx"
echo "{}" >"$fixture/docs/reference/openapi.json"
echo "export {}" >"$fixture/apps/web/src/api/schema.ts"
echo "export {}" >"$fixture/apps/api/worker-configuration.d.ts"
echo "lockfile" >"$fixture/pnpm-lock.yaml"
git -C "$fixture" add -A
git -C "$fixture" commit -q -m base
base_sha="$(git -C "$fixture" rev-parse HEAD)"

# --- under default budget: a couple of lines in one file ---
{
  echo "line1"
  echo "line2"
} >>"$fixture/apps/web/src/App.tsx"
git -C "$fixture" add -A
git -C "$fixture" commit -q -m small-change
small_sha="$(git -C "$fixture" rev-parse HEAD)"

assert_pass "small change within default budget" \
  "$SCRIPT" "$base_sha" "$small_sha"

# --- over the lines budget (tight override) ---
assert_fail "exceeds overridden lines budget" \
  env PR_DIFF_SIZE_MAX_LINES=1 PR_DIFF_SIZE_MAX_FILES=40 \
  "$SCRIPT" "$base_sha" "$small_sha"

# --- over the files budget (tight override), two files touched ---
echo "other file" >"$fixture/apps/web/src/Other.tsx"
git -C "$fixture" add -A
git -C "$fixture" commit -q -m two-files
two_files_sha="$(git -C "$fixture" rev-parse HEAD)"

assert_fail "exceeds overridden files budget" \
  env PR_DIFF_SIZE_MAX_LINES=800 PR_DIFF_SIZE_MAX_FILES=1 \
  "$SCRIPT" "$base_sha" "$two_files_sha"

assert_pass "two files still within default budget" \
  "$SCRIPT" "$base_sha" "$two_files_sha"

# --- excluded generated/lockfile paths don't count, even with a huge diff ---
{
  i=0
  while [ "$i" -lt 50 ]; do
    echo "generated line $i"
    i=$((i + 1))
  done
} >>"$fixture/docs/reference/openapi.json"
{
  i=0
  while [ "$i" -lt 50 ]; do
    echo "schema line $i"
    i=$((i + 1))
  done
} >>"$fixture/apps/web/src/api/schema.ts"
{
  i=0
  while [ "$i" -lt 50 ]; do
    echo "worker-config line $i"
    i=$((i + 1))
  done
} >>"$fixture/apps/api/worker-configuration.d.ts"
{
  i=0
  while [ "$i" -lt 50 ]; do
    echo "lockfile line $i"
    i=$((i + 1))
  done
} >>"$fixture/pnpm-lock.yaml"
git -C "$fixture" add -A
git -C "$fixture" commit -q -m regen-only
regen_sha="$(git -C "$fixture" rev-parse HEAD)"

# 4 files / ~200 lines changed, but all excluded — a MAX_LINES=1/MAX_FILES=1
# override should still pass if exclusion works. Diffed from two_files_sha
# (not base_sha) so this isolates the generated-only commit — base_sha would
# also pull in the earlier App.tsx/Other.tsx changes, which aren't excluded.
out="$(in_fixture env PR_DIFF_SIZE_MAX_LINES=1 PR_DIFF_SIZE_MAX_FILES=1 \
  "$SCRIPT" "$two_files_sha" "$regen_sha" 2>&1)" && ec=0 || ec=$?
if [ "$ec" -eq 0 ] && grep -q '^files=0$' <<<"$out" && grep -q '^lines=0$' <<<"$out"; then
  echo "ok  generated/lockfile-only diff excluded (files=0, lines=0)"
else
  echo "FAIL generated/lockfile-only diff was not fully excluded" >&2
  echo "$out" >&2
  fail=1
fi

# --- binary files count as a file but contribute no lines ---
printf '\x00\x01\x02\x03binary' >"$fixture/apps/web/src/asset.bin"
git -C "$fixture" add -A
git -C "$fixture" commit -q -m binary-file
binary_sha="$(git -C "$fixture" rev-parse HEAD)"

out="$(in_fixture env PR_DIFF_SIZE_MAX_LINES=800 PR_DIFF_SIZE_MAX_FILES=40 \
  "$SCRIPT" "$regen_sha" "$binary_sha" 2>&1)" && ec=0 || ec=$?
if [ "$ec" -eq 0 ] && grep -q '^files=1$' <<<"$out" && grep -q '^lines=0$' <<<"$out"; then
  echo "ok  binary file counts as a file, contributes no lines"
else
  echo "FAIL binary file line/file accounting is wrong" >&2
  echo "$out" >&2
  fail=1
fi

# --- fails closed when merge-base can't be determined ---
assert_fail "unresolvable ref fails closed" \
  "$SCRIPT" "not-a-real-ref-at-all" "$small_sha"

if [ "$fail" -ne 0 ]; then
  echo "pr-diff-size-budget selftest FAILED" >&2
  exit 1
fi
echo "pr-diff-size-budget selftest passed"
