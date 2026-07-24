#!/usr/bin/env bash
# Self-test for mutation-scope.sh and mutation-decide.sh.
# Run from repo root: .github/scripts/mutation-scope.selftest.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCOPE="$ROOT/.github/scripts/mutation-scope.sh"
DECIDE="$ROOT/.github/scripts/mutation-decide.sh"
fail=0

assert_in() {
  local label="$1"
  shift
  if printf '%s\n' "$@" | "$SCOPE"; then
    echo "ok  in-scope: $label"
  else
    echo "FAIL in-scope: $label" >&2
    fail=1
  fi
}

assert_out() {
  local label="$1"
  shift
  if printf '%s\n' "$@" | "$SCOPE"; then
    echo "FAIL out-of-scope (matched): $label" >&2
    fail=1
  else
    echo "ok  out-of-scope: $label"
  fi
}

assert_decide() {
  local label="$1"
  local expect="$2"
  shift 2
  local out
  out="$("$DECIDE" "$@" 2>/dev/null | grep '^run=' | head -1 || true)"
  if [ "$out" = "run=$expect" ]; then
    echo "ok  decide $label → run=$expect"
  else
    echo "FAIL decide $label: got '$out', want run=$expect" >&2
    fail=1
  fi
}

assert_in "domain" "apps/api/src/domain/asset/Asset.ts"
assert_in "application" "apps/api/src/application/usecases/GetAsset.ts"
assert_in "packages/shared" "packages/shared/src/Result.ts"
assert_in "stryker.conf" "apps/api/stryker.conf.json"
assert_in "package.json" "apps/api/package.json"
assert_in "vitest.config" "apps/api/vitest.config.ts"
assert_in "tsconfig" "apps/api/tsconfig.json"
assert_in "lockfile" "pnpm-lock.yaml"
assert_in "workflow" ".github/workflows/mutation.yml"
assert_in "scope script" ".github/scripts/mutation-scope.sh"
assert_in "decide script" ".github/scripts/mutation-decide.sh"
assert_in "selftest script" ".github/scripts/mutation-scope.selftest.sh"
assert_in "future gate script" ".github/scripts/mutation-ratchet.sh"
assert_in "mixed list" "apps/web/src/app/App.tsx" "apps/api/src/domain/team/Team.ts"

# Large in-scope list: first path matches; grep must drain stdin (no SIGPIPE skip).
large_list="$(mktemp)"
{
  echo "apps/api/src/domain/asset/Asset.ts"
  # ~2500 out-of-scope paths after the match — exceeds typical 64KB pipe buffer when
  # combined with path length, so a -q early-exit would SIGPIPE the writer.
  i=0
  while [ "$i" -lt 2500 ]; do
    printf 'apps/web/src/generated/file-%05d.ts\n' "$i"
    i=$((i + 1))
  done
} >"$large_list"
# Must be a pipe (matches production: printf | scope). File redirect cannot
# SIGPIPE, so it would not catch a grep -q regression.
if cat "$large_list" | "$SCOPE"; then
  echo "ok  in-scope: large list via pipe (no SIGPIPE skip)"
else
  echo "FAIL in-scope: large list via pipe (SIGPIPE or miss)" >&2
  fail=1
fi
rm -f "$large_list"

assert_out "web" "apps/web/src/app/App.tsx"
assert_out "infrastructure" "apps/api/src/infrastructure/persistence/D1.ts"
assert_out "api layer" "apps/api/src/api/schemas/foo.ts"
assert_out "docs" "docs/specs/cross-cutting/testing.md"
assert_out "blank line" ""
if "$SCOPE" </dev/null; then
  echo "FAIL out-of-scope (matched): empty stdin" >&2
  fail=1
else
  echo "ok  out-of-scope: empty stdin"
fi

assert_decide "always" "true" always
assert_decide "pr missing shas" "true" pr
assert_decide "pr bad shas" "true" pr not-a-real-sha also-not-real

# Fixture repo: real git diffs through decide (covers scope path both directions).
fixture="$(mktemp -d)"
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT
git -C "$fixture" init -q
git -C "$fixture" config user.email "selftest@example.com"
git -C "$fixture" config user.name "selftest"
mkdir -p "$fixture/apps/web/src" "$fixture/apps/api/src/domain"
echo a >"$fixture/apps/web/src/App.tsx"
git -C "$fixture" add apps/web/src/App.tsx
git -C "$fixture" commit -q -m base
base_sha="$(git -C "$fixture" rev-parse HEAD)"
echo b >"$fixture/apps/web/src/App.tsx"
git -C "$fixture" add apps/web/src/App.tsx
git -C "$fixture" commit -q -m out-of-scope
out_sha="$(git -C "$fixture" rev-parse HEAD)"
echo c >"$fixture/apps/api/src/domain/Asset.ts"
git -C "$fixture" add apps/api/src/domain/Asset.ts
git -C "$fixture" commit -q -m in-scope
in_sha="$(git -C "$fixture" rev-parse HEAD)"

MUTATION_REPO_DIR="$fixture" assert_decide "pr out-of-scope diff" "false" pr "$base_sha" "$out_sha"
MUTATION_REPO_DIR="$fixture" assert_decide "pr in-scope diff" "true" pr "$out_sha" "$in_sha"

if [ "$fail" -ne 0 ]; then
  echo "mutation-scope selftest FAILED" >&2
  exit 1
fi
echo "mutation-scope selftest passed"
