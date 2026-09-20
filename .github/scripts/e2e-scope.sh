#!/usr/bin/env bash
# Exit 0 when any newline-separated path on stdin affects browser E2E confidence.
set -euo pipefail

# Drain stdin fully: quiet early-exit under pipefail can SIGPIPE the producer and
# fail open on a large change list.
SCOPE_RE='^(apps/api/src/|apps/api/(package\.json|tsconfig\.json|wrangler\.jsonc)|apps/web/(index\.html|src/|worker/|vite/|public/|e2e/|package\.json|playwright\.config\.ts|vite\.config\.ts|vitest\.config\.ts|wrangler\.jsonc)|packages/shared/|migrations/|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vitest\.config\.ts|\.github/workflows/e2e\.yml|\.github/scripts/e2e-[a-z0-9.-]*\.sh)'

grep -E "$SCOPE_RE" > /dev/null
