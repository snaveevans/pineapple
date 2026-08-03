#!/usr/bin/env bash
# Self-test for migration-ddl-scan.sh.
# Run from repo root: .github/scripts/migration-ddl-scan.selftest.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCAN="$ROOT/.github/scripts/migration-ddl-scan.sh"
fail=0

# Runs the scanner against a single-file fixture directory. Prints the
# scanner's combined output and exit status via the out/status globals.
run_fixture() {
  local sql="$1"
  local dir
  dir="$(mktemp -d)"
  printf '%s\n' "$sql" >"$dir/0001_fixture.sql"
  set +e
  out="$("$SCAN" "$dir" 2>&1)"
  status=$?
  set -e
  rm -rf "$dir"
}

assert_pass() {
  local label="$1" sql="$2"
  run_fixture "$sql"
  if [ "$status" -eq 0 ]; then
    echo "ok  pass: $label"
  else
    echo "FAIL pass: $label (status=$status)" >&2
    printf '%s\n' "$out" >&2
    fail=1
  fi
}

assert_flag() {
  local label="$1" sql="$2"
  run_fixture "$sql"
  if [ "$status" -ne 0 ] && printf '%s' "$out" | grep -q '::error'; then
    echo "ok  flag: $label"
  else
    echo "FAIL flag: $label (status=$status)" >&2
    printf '%s\n' "$out" >&2
    fail=1
  fi
}

# --- fixture table from issue #119 ---

assert_pass "CREATE TABLE with several NOT NULL columns" \
  'CREATE TABLE t (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);'

assert_pass "ADD COLUMN, nullable" \
  'ALTER TABLE t ADD COLUMN c TEXT;'

assert_pass "ADD COLUMN NOT NULL with DEFAULT" \
  "ALTER TABLE t ADD COLUMN c TEXT NOT NULL DEFAULT '';"

assert_pass "comment line mentioning drop table" \
  '-- we should drop table foo later'

assert_flag "DROP TABLE" \
  'DROP TABLE t;'

assert_flag "DROP COLUMN" \
  'ALTER TABLE t DROP COLUMN c;'

assert_flag "RENAME COLUMN" \
  'ALTER TABLE t RENAME COLUMN a TO b;'

assert_flag "ADD COLUMN NOT NULL, no default" \
  'ALTER TABLE t ADD COLUMN c TEXT NOT NULL;'

assert_pass "DROP COLUMN acknowledged by destructive-ok" \
  $'-- destructive-ok: superseded by 0042, unused since\nALTER TABLE t DROP COLUMN c;'

# multiple findings in one file: flags all, exit 1
dir="$(mktemp -d)"
printf '%s\n' 'DROP TABLE a;' 'ALTER TABLE t DROP COLUMN c;' >"$dir/0001_fixture.sql"
set +e
out="$("$SCAN" "$dir" 2>&1)"
status=$?
set -e
rm -rf "$dir"
count="$(printf '%s\n' "$out" | grep -c '::error' || true)"
if [ "$status" -ne 0 ] && [ "$count" -eq 2 ]; then
  echo "ok  flag: multiple findings in one file (flags all)"
else
  echo "FAIL flag: multiple findings in one file (status=$status count=$count)" >&2
  printf '%s\n' "$out" >&2
  fail=1
fi

# --- additional edge cases named explicitly in issue #119's design ---

assert_flag "ALTER TABLE ... RENAME TO (table rename)" \
  'ALTER TABLE t RENAME TO t2;'

assert_flag "destructive-ok with no reason does not acknowledge" \
  $'-- destructive-ok:\nDROP TABLE t;'

assert_pass "destructive-ok acknowledgment across a blank line" \
  $'-- destructive-ok: cleanup, see #123\n\nDROP TABLE t;'

if [ "$fail" -ne 0 ]; then
  echo "migration-ddl-scan selftest FAILED" >&2
  exit 1
fi
echo "migration-ddl-scan selftest passed"
