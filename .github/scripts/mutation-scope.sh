#!/usr/bin/env bash
# Pure path-scope check for the mutation gate (ADR-0016 / testing.md).
#
# Usage:
#   printf '%s\n' <paths...> | .github/scripts/mutation-scope.sh
#
# Exit 0 if any path is in mutation scope; exit 1 if none are.
# Reads newline-separated paths from stdin.
set -euo pipefail

# Keep in sync with docs/specs/cross-cutting/testing.md "Run scope".
# packages/shared is included: domain/application import branded IDs, Result, and
# DomainError from it, so shared changes can move the mutation score.
# shellcheck disable=SC2016
SCOPE_RE='^(apps/api/src/(domain|application)/|packages/shared/|apps/api/stryker\.conf\.json|apps/api/package\.json|pnpm-lock\.yaml|\.github/workflows/mutation\.yml|\.github/scripts/mutation-(scope|decide|scope\.selftest)\.sh)'

grep -qE "$SCOPE_RE"
