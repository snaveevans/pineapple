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
# character is `--`) entirely, and ignores a trailing `-- ...` comment on an
# otherwise-SQL line so prose after a statement can't suppress a match or
# fake an acknowledgment. A clause belongs to ALTER TABLE if the current
# *statement* opened with it, not just the current physical line — so a
# clause keyword on a continuation line (ALTER TABLE on the line above) is
# still recognized. Case-insensitively flags a line whose SQL content (after
# this stripping) is:
#   1. `DROP TABLE`
#   2. `ALTER TABLE ... DROP [COLUMN] <name>`      (COLUMN is optional in SQLite)
#   3. `ALTER TABLE ... RENAME TO <name>`, or
#      `ALTER TABLE ... RENAME [COLUMN] <a> TO <b>` (COLUMN is optional in SQLite)
#   4. `ALTER TABLE ... ADD [COLUMN] ... NOT NULL`, without a `DEFAULT` clause
#      of its own (COLUMN is optional; a `DEFAULT` inside an identifier or a
#      trailing comment does not count)
#
# A finding is acknowledged when the immediately preceding non-blank line —
# or, if the finding is on a continuation line of a still-open statement, the
# line immediately before that statement began — matches, case-insensitively:
#   -- destructive-ok: <reason>
# with a reason present. This must live in the file so the acknowledgment is
# durable across every future run, not just the one PR. Blank lines between
# the acknowledgment and the finding are allowed.
#
# Emits one `::error file=<path>,line=<n>::<message>` per unacknowledged
# finding. Fails closed: a missing directory or one with no *.sql files is a
# scan failure, not a silent pass — a relocated migrations dir must not leave
# this gate permanently green. Exit 1 on any unacknowledged finding or an
# empty scan, else 0.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:-$ROOT/migrations}"

ACK_RE='^[[:space:]]*--[[:space:]]*DESTRUCTIVE-OK:[[:space:]]*[^[:space:]]'

has_default() {
  # Word-boundary match so a column named e.g. default_location, or the word
  # DEFAULT inside a trailing comment (already stripped before this is
  # called), doesn't suppress a genuine missing-DEFAULT finding.
  [[ "$1" =~ (^|[^A-Z0-9_])DEFAULT([^A-Z0-9_]|$) ]]
}

is_destructive() {
  local upper="$1"
  local alter_table_open="$2"

  [[ "$upper" == *'DROP TABLE'* ]] && return 0

  # Everything else is a clause of ALTER TABLE — either this line names it
  # directly, or we're on a continuation line of a statement that opened
  # with it (alter_table_open, tracked by the caller across physical lines).
  if [[ "$upper" != *'ALTER TABLE'* ]] && [ "$alter_table_open" != true ]; then
    return 1
  fi

  # ALTER TABLE ... DROP [COLUMN] <name>
  [[ "$upper" =~ DROP[[:space:]]+(COLUMN[[:space:]]+)?[A-Z_][A-Z0-9_]* ]] && return 0

  # ALTER TABLE ... RENAME TO <name>             (table rename)
  # ALTER TABLE ... RENAME [COLUMN] <a> TO <b>   (column rename)
  [[ "$upper" == *'RENAME TO'* ]] && return 0
  [[ "$upper" =~ RENAME[[:space:]]+(COLUMN[[:space:]]+)?[A-Z_][A-Z0-9_]*[[:space:]]+TO ]] && return 0

  # ALTER TABLE ... ADD [COLUMN] ... NOT NULL, without its own DEFAULT
  if [[ "$upper" =~ ADD[[:space:]]+(COLUMN[[:space:]]+)?[A-Z_][A-Z0-9_]* ]] \
      && [[ "$upper" == *'NOT NULL'* ]] \
      && ! has_default "$upper"; then
    return 0
  fi

  return 1
}

fail=0

shopt -s nullglob
files=("$DIR"/*.sql)
shopt -u nullglob

if [ "${#files[@]}" -eq 0 ]; then
  echo "::error::No .sql files found under '${DIR}' — migration-ddl-scan.sh fails closed rather than passing an empty scan (a relocated or missing migrations dir must not leave this gate silently green)."
  exit 1
fi

for file in "${files[@]}"; do
  rel="$file"
  [[ "$file" == "$ROOT"/* ]] && rel="${file#"$ROOT"/}"

  prev_nonblank=""
  ack_anchor=""
  in_statement=false
  alter_table_open=false
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
      continue # whole-line comment: never scanned for destructive DDL
    fi

    # Drop a trailing `-- ...` comment before classifying, so prose after a
    # statement (e.g. "-- TODO: add a DEFAULT") can't hide or fake a finding.
    sql_part="${line%%--*}"
    upper="$(printf '%s' "$sql_part" | tr '[:lower:]' '[:upper:]')"

    # The acknowledgment must precede the *statement*, not just this line —
    # a destructive statement wrapped onto multiple lines is still one
    # statement, and the comment above its first line is what an author
    # actually wrote the acknowledgment against. Likewise, whether a clause
    # belongs to ALTER TABLE is a property of the statement, decided once
    # when it opens, not re-derived per physical line — a clause keyword can
    # land on a continuation line with ALTER TABLE above it.
    if [ "$in_statement" = false ]; then
      ack_anchor="$prev_nonblank"
      if [[ "$upper" == *'ALTER TABLE'* ]]; then
        alter_table_open=true
      else
        alter_table_open=false
      fi
    fi

    if is_destructive "$upper" "$alter_table_open"; then
      ack_anchor_upper="$(printf '%s' "$ack_anchor" | tr '[:lower:]' '[:upper:]')"
      if [[ "$ack_anchor_upper" =~ $ACK_RE ]]; then
        : # acknowledged in-file — pass
      else
        echo "::error file=${rel},line=${line_no}::Destructive DDL with no preceding '-- destructive-ok: <reason>' comment: ${trimmed}"
        fail=1
      fi
    fi

    if [[ "$sql_part" =~ \;[[:space:]]*$ ]]; then
      in_statement=false
    else
      in_statement=true
    fi

    prev_nonblank="$line"
  done < "$file"
done

exit "$fail"
