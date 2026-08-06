#!/usr/bin/env bash
# Applies every migration in /migrations, in order, to a fresh local D1 — the
# same command deploy.yml runs --remote against production, one flag
# different. Catches migration ordering bugs and invalid SQL on the PR,
# before deploy.yml applies the same files --remote against production
# (issue #119).
#
# Does NOT catch destructive DDL that only misbehaves against a *populated*
# table (the empty-table trap, docs/specs/cross-cutting/schema-migrations.md)
# — a fresh D1 has no rows to trip it. migration-ddl-scan.sh answers that
# question separately, by reading the SQL text instead of applying it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Gitignored, so a fresh checkout is already clean — but re-running this
# script locally (or after a prior failed run) must still start fresh.
rm -rf "$ROOT/apps/api/.wrangler/state/v3/d1"

cd "$ROOT/apps/api"
pnpm wrangler d1 migrations apply pineapple --local
