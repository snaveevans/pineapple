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

# --- regressions from PR #173 review: COLUMN is optional in SQLite's ALTER
# TABLE grammar, and DEFAULT/the ack marker must be matched as whole words,
# not raw substrings ---

assert_flag "ADD without the optional COLUMN keyword, NOT NULL no default" \
  'ALTER TABLE t ADD c TEXT NOT NULL;'

assert_flag "DROP without the optional COLUMN keyword" \
  'ALTER TABLE t DROP c;'

assert_flag "RENAME without the optional COLUMN keyword" \
  'ALTER TABLE t RENAME a TO b;'

assert_flag "NOT NULL column named default_* is not suppressed by its own name" \
  'ALTER TABLE assets ADD COLUMN default_location TEXT NOT NULL;'

assert_flag "trailing comment mentioning DEFAULT does not suppress the finding" \
  'ALTER TABLE assets ADD COLUMN status TEXT NOT NULL; -- TODO: add a DEFAULT'

assert_pass "destructive-ok acknowledges a statement wrapped onto multiple lines" \
  $'-- destructive-ok: superseded by 0042\nALTER TABLE t\n  DROP COLUMN c;'

# Paired with the assert_pass above: the same fixture minus the
# acknowledgment must still be *detected* and flagged. Without this, a
# fixture that is never classified as destructive in the first place would
# pass the ack test too, for the wrong reason (PR #173 2nd-pass review).
assert_flag "DROP COLUMN wrapped onto multiple lines, no acknowledgment" \
  $'ALTER TABLE t\n  DROP COLUMN c;'

assert_flag "ADD COLUMN NOT NULL wrapped onto multiple lines, no default" \
  $'ALTER TABLE assets\n  ADD COLUMN status TEXT NOT NULL;'

# Paired with the two assert_flag cases above, in the other direction: a
# *safe* statement wrapped across lines must still pass. Detection spans the
# whole open statement now (alter_table_open), so the DEFAULT half of
# pattern 4 must too, or a same-line-only DEFAULT check flags legitimate SQL
# whose DEFAULT clause lands on its own continuation line (PR #173 3rd-pass
# review).
assert_pass "ADD COLUMN NOT NULL wrapped, DEFAULT on its own continuation line" \
  $'ALTER TABLE assets\n  ADD COLUMN status TEXT NOT NULL\n  DEFAULT \'active\';'

assert_pass "ADD COLUMN wrapped, DEFAULT before NOT NULL on separate lines" \
  $'ALTER TABLE assets\n  ADD COLUMN status TEXT DEFAULT \'active\'\n  NOT NULL;'

assert_flag "RENAME COLUMN wrapped onto multiple lines, no acknowledgment" \
  $'ALTER TABLE t\n  RENAME COLUMN a TO b;'

assert_pass "destructive-ok marker is matched case-insensitively" \
  $'-- DESTRUCTIVE-OK: reason here\nDROP TABLE t;'

# Fail closed: a missing or empty migrations dir must not scan zero files and
# report success — that would leave the gate permanently green if the
# directory were ever relocated without updating this script's default.
missing_dir="$(mktemp -u)/does-not-exist"
set +e
out="$("$SCAN" "$missing_dir" 2>&1)"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  echo "ok  flag: nonexistent migrations dir fails closed"
else
  echo "FAIL flag: nonexistent migrations dir should fail closed, got status=$status" >&2
  printf '%s\n' "$out" >&2
  fail=1
fi

empty_dir="$(mktemp -d)"
set +e
out="$("$SCAN" "$empty_dir" 2>&1)"
status=$?
set -e
rm -rf "$empty_dir"
if [ "$status" -ne 0 ]; then
  echo "ok  flag: empty migrations dir fails closed"
else
  echo "FAIL flag: empty migrations dir should fail closed, got status=$status" >&2
  printf '%s\n' "$out" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "migration-ddl-scan selftest FAILED" >&2
  exit 1
fi
echo "migration-ddl-scan selftest passed"
