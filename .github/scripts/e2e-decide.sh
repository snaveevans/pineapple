#!/usr/bin/env bash
# Emit GITHUB_OUTPUT-style run=true|false for the path-aware E2E workflow.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
repo_dir="${E2E_REPO_DIR:-$root}"
scope_script="$root/.github/scripts/e2e-scope.sh"

mode="${1:-}"
case "$mode" in
  always)
    echo "run=true"
    echo "Reason: non-PR event runs the critical browser suite" >&2
    ;;
  pr)
    base="${2:-}"
    head="${3:-}"
    if [ -z "$base" ] || [ -z "$head" ]; then
      echo "run=true"
      echo "Reason: missing base/head SHAs; failing closed" >&2
      exit 0
    fi
    if ! files="$(git -C "$repo_dir" diff --name-only "$base"..."$head")"; then
      echo "run=true"
      echo "Reason: git diff failed; failing closed" >&2
      exit 0
    fi
    files_tmp="$(mktemp)"
    trap 'rm -f "$files_tmp"' EXIT
    printf '%s\n' "$files" >"$files_tmp"
    if "$scope_script" <"$files_tmp"; then
      echo "run=true"
      echo "Reason: PR touches browser E2E scope" >&2
    else
      echo "run=false"
      echo "Reason: docs-only or non-runtime PR; reporting successful skip" >&2
    fi
    ;;
  *)
    echo "usage: $0 always | pr <base_sha> <head_sha>" >&2
    exit 2
    ;;
esac
