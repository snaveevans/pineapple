#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
scope="$root/.github/scripts/e2e-scope.sh"
decide="$root/.github/scripts/e2e-decide.sh"
fail=0

assert_in() {
  local path="$1"
  if printf '%s\n' "$path" | "$scope"; then
    echo "ok  in-scope: $path"
  else
    echo "FAIL in-scope: $path" >&2
    fail=1
  fi
}

assert_out() {
  local path="$1"
  if printf '%s\n' "$path" | "$scope"; then
    echo "FAIL out-of-scope: $path" >&2
    fail=1
  else
    echo "ok  out-of-scope: $path"
  fi
}

assert_in "apps/api/src/worker.ts"
assert_in "apps/web/src/app/AppAssets.tsx"
assert_in "apps/web/index.html"
assert_in "apps/web/vite/asset-manifest.ts"
assert_in "apps/web/public/favicon.svg"
assert_in "apps/web/e2e/critical-paths.spec.ts"
assert_in "apps/web/vitest.config.ts"
assert_in "packages/shared/Result.ts"
assert_in "migrations/0022_scheduled_reminder_snooze.sql"
assert_in "pnpm-lock.yaml"
assert_in "pnpm-workspace.yaml"
assert_in "vitest.config.ts"
assert_in ".github/workflows/e2e.yml"
assert_out "docs/specs/features/asset-library.md"
assert_out "docs/intents/features/asset-library.md"

if grep -nE '^[^#]*grep[[:space:]]+-q' "$scope" >/dev/null; then
  echo "FAIL e2e-scope.sh must drain stdin instead of using grep -q" >&2
  fail=1
fi

fixture="$(mktemp -d)"
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT
git -C "$fixture" init -q
git -C "$fixture" config user.email "selftest@example.com"
git -C "$fixture" config user.name "selftest"
mkdir -p "$fixture/docs" "$fixture/apps/web/src"
echo base >"$fixture/docs/readme.md"
git -C "$fixture" add .
git -C "$fixture" commit -q -m base
base_sha="$(git -C "$fixture" rev-parse HEAD)"
echo docs >>"$fixture/docs/readme.md"
git -C "$fixture" commit -qam docs
docs_sha="$(git -C "$fixture" rev-parse HEAD)"
echo runtime >"$fixture/apps/web/src/App.tsx"
git -C "$fixture" add .
git -C "$fixture" commit -q -m runtime
runtime_sha="$(git -C "$fixture" rev-parse HEAD)"

docs_result="$(E2E_REPO_DIR="$fixture" "$decide" pr "$base_sha" "$docs_sha" 2>/dev/null)"
runtime_result="$(E2E_REPO_DIR="$fixture" "$decide" pr "$docs_sha" "$runtime_sha" 2>/dev/null)"
if [ "$docs_result" != "run=false" ]; then
  echo "FAIL docs decision: $docs_result" >&2
  fail=1
fi
if [ "$runtime_result" != "run=true" ]; then
  echo "FAIL runtime decision: $runtime_result" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "e2e scope selftest FAILED" >&2
  exit 1
fi
echo "e2e scope selftest passed"
