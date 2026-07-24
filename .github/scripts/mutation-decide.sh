#!/usr/bin/env bash
# Decide whether the mutation gate should run. Writes GITHUB_OUTPUT-style lines
# to stdout: run=true|false
#
# Usage:
#   mutation-decide.sh always
#   mutation-decide.sh pr <base_sha> <head_sha>
#
# Fail closed: if the PR diff cannot be computed, prints run=true.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCOPE_SCRIPT="$ROOT/.github/scripts/mutation-scope.sh"

mode="${1:-}"
case "$mode" in
  always)
    echo "run=true"
    echo "Reason: non-PR event always runs full mutation suite" >&2
    ;;
  pr)
    base="${2:-}"
    head="${3:-}"
    if [ -z "$base" ] || [ -z "$head" ]; then
      echo "run=true"
      echo "Reason: missing base/head SHAs — fail closed, running mutation suite" >&2
      exit 0
    fi
    if ! files="$(git -C "$ROOT" diff --name-only "$base"..."$head")"; then
      echo "run=true"
      echo "Reason: git diff failed — fail closed, running mutation suite" >&2
      exit 0
    fi
    if printf '%s\n' "$files" | "$SCOPE_SCRIPT"; then
      echo "run=true"
      echo "Reason: PR touches mutation scope" >&2
    else
      echo "run=false"
      echo "Reason: PR does not touch mutation scope — skipping" >&2
    fi
    ;;
  *)
    echo "usage: $0 always | pr <base_sha> <head_sha>" >&2
    exit 2
    ;;
esac
