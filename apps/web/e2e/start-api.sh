#!/usr/bin/env bash
# Start the API against a disposable local D1 database for browser tests.
set -euo pipefail

api_dir="$(cd "$(dirname "$0")/../../api" && pwd)"
e2e_state_dir="$(mktemp -d "${TMPDIR:-/tmp}/pineapple-e2e.XXXXXX")"
api_pid=""

cleanup() {
  if [ -n "$api_pid" ]; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
  rm -rf -- "${e2e_state_dir:?}"
}
trap cleanup EXIT INT TERM

cd "$api_dir"
CI=true pnpm wrangler d1 migrations apply pineapple --local --persist-to "$e2e_state_dir"

pnpm wrangler dev \
  --persist-to "$e2e_state_dir" \
  --port 8877 \
  --var ENVIRONMENT:development \
  --var DEV_AUTH_EMAIL:e2e@pineapple.test \
  --var BETTER_AUTH_SECRET:e2e-only-better-auth-secret-32-chars \
  --var BETTER_AUTH_URL:http://localhost:5273 \
  --var DEV_WEB_ORIGIN:http://localhost:5273 \
  --var GOOGLE_CLIENT_ID:e2e-client-id \
  --var GOOGLE_CLIENT_SECRET:e2e-client-secret &
api_pid="$!"

wait "$api_pid"
