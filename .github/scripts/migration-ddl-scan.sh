#!/usr/bin/env bash
# Static scan for destructive DDL in migrations/*.sql (ADR-0017,
# docs/specs/cross-cutting/schema-migrations.md). Convention twin of
# mutation-scope.sh: small, pure, selftested.
#
# Not redundant with migrations-fresh-apply.sh: a fresh D1 is empty, and
# SQLite only rejects `ADD COLUMN ... NOT NULL` without a default against a
# *populated* table (the empty-table trap). Applying migrations to a clean
# database can never reach that case — only reading the SQL text can. The two
# checks answer different questions; neither subsumes the other.
#
# Usage:
#   .github/scripts/migration-ddl-scan.sh [dir]   (default: migrations/)
#
# Scans every *.sql file in dir. Skips comment lines (first non-whitespace
# character is `--`) entirely — matching happens only on SQL lines.
# Case-insensitively flags a line containing:
#   1. DROP TABLE
#   2. DROP COLUMN
#   3. RENAME COLUMN, or (ALTER TABLE and RENAME TO together)
#   4. ALTER TABLE and ADD COLUMN and NOT NULL, without DEFAULT
#
# A finding is acknowledged when the immediately preceding non-blank line
# (comment or not) matches:
#   -- destructive-ok: <reason>
# with a reason present — this must live in the file so the acknowledgment is
# durable across every future run, not just the one PR. Blank lines between
# the acknowledgment and the finding are allowed.
#
# Emits one `::error file=<path>,line=<n>::<message>` per unacknowledged
# finding. Exit 1 if any unacknowledged finding, else 0.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:-$ROOT/migrations}"

ACK_RE='^[[:space:]]*--[[:space:]]*destructive-ok:[[:space:]]*[^[:space:]]'

is_destructive() {
  local upper="$1"
  case "$upper" in
    *'DROP TABLE'*) return 0 ;;
    *'DROP COLUMN'*) return 0 ;;
    *'RENAME COLUMN'*) return 0 ;;
  esac
  if [[ "$upper" == *'ALTER TABLE'* && "$upper" == *'RENAME TO'* ]]; then
    return 0
  fi
  if [[ "$upper" == *'ALTER TABLE'* && "$upper" == *'ADD COLUMN'* \
        && "$upper" == *'NOT NULL'* && "$upper" != *'DEFAULT'* ]]; then
    return 0
  fi
  return 1
}

fail=0

shopt -s nullglob
files=("$DIR"/*.sql)
shopt -u nullglob

for file in "${files[@]}"; do
  rel="$file"
  [[ "$file" == "$ROOT"/* ]] && rel="${file#"$ROOT"/}"

  prev_nonblank=""
  line_no=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))

    # Leading-whitespace-stripped view, used only to classify the line.
    trimmed="${line#"${line%%[![:space:]]*}"}"

    if [ -z "$trimmed" ]; then
      continue # blank line: does not update prev_nonblank
    fi

    if [[ "$trimmed" == --* ]]; then
      prev_nonblank="$line"
      continue # comment line: never scanned for destructive DDL
    fi

    upper="$(printf '%s' "$line" | tr '[:lower:]' '[:upper:]')"
    if is_destructive "$upper"; then
      if [[ "$prev_nonblank" =~ $ACK_RE ]]; then
        : # acknowledged in-file — pass
      else
        echo "::error file=${rel},line=${line_no}::Destructive DDL with no preceding '-- destructive-ok: <reason>' comment: ${trimmed}"
        fail=1
      fi
    fi

    prev_nonblank="$line"
  done < "$file"
done

exit "$fail"
