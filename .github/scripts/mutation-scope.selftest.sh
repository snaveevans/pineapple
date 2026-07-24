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
  out="$("$DECIDE" "$@" 2>/dev/null | grep '^run=' | head -1)"
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
assert_in "lockfile" "pnpm-lock.yaml"
assert_in "workflow" ".github/workflows/mutation.yml"
assert_in "scope script" ".github/scripts/mutation-scope.sh"
assert_in "decide script" ".github/scripts/mutation-decide.sh"
assert_in "selftest script" ".github/scripts/mutation-scope.selftest.sh"
assert_in "mixed list" "apps/web/src/app/App.tsx" "apps/api/src/domain/team/Team.ts"

assert_out "web" "apps/web/src/app/App.tsx"
assert_out "infrastructure" "apps/api/src/infrastructure/persistence/D1.ts"
assert_out "api layer" "apps/api/src/api/schemas/foo.ts"
assert_out "docs" "docs/specs/cross-cutting/testing.md"
assert_out "empty" ""

assert_decide "always" "true" always
assert_decide "pr missing shas" "true" pr
assert_decide "pr bad shas" "true" pr not-a-real-sha also-not-real

if [ "$fail" -ne 0 ]; then
  echo "mutation-scope selftest FAILED" >&2
  exit 1
fi
echo "mutation-scope selftest passed"
