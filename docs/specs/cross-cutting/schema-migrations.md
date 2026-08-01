---
audience: all contributors
purpose: how D1 schema changes are staged so a code rollback never leaves production broken
source: this file
date: 2026-08-01
---

# Schema Migrations — Cross-Cutting Spec

**Status:** `review`
**Owner:** engineering
**Applies To:** Every change that adds or edits a file in `/migrations`

> The rule is expand/contract, decided in
> [ADR-0017](../../decisions/0017-expand-contract-schema-migrations.md), which also decided it is
> enforced by a blocking CI gate. **While this spec's status is `review`, that gate is not live and
> the rule holds on author discipline.**

---

## Summary

`deploy.yml` applies pending migrations to production **before** `wrangler deploy`. Schema
therefore moves first and, unlike code, never moves back: no rollback path reverts DDL. Two
situations put old code in front of new schema — a Worker deploy that fails after the migration
succeeded, and a deploy that succeeds and is rolled back later.

Additive, nullable change survives both; old code simply ignores a column it does not know about.
A drop, a rename, or a `NOT NULL` addition does not, and the damage is unrecoverable.

**So schema change is staged: add first, remove much later.** The removal is separated from the
code that stops using the column by at least one deploy. Nothing else about this spec matters as
much as that separation.

## Canonical Behavior

### The expand/contract sequence

A schema change proceeds in phases. Phases 1-3 usually ride together; **phase 4 is always a
separate, later PR.**

1. **Expand.** Add the new column or table — nullable, no `NOT NULL`, no rename in place. The old
   shape stays exactly as it was and keeps working.
2. **Backfill.** Populate the new shape, either in its own migration or lazily at runtime. Old code
   is still reading the old columns while this happens.
3. **Ship.** Deploy code that writes and reads the new shape while still tolerating the old. After
   this deploy is live and healthy, nothing reads the old shape any more.
4. **Contract.** In a **later PR**, drop what is now unused.

**The separation is the whole point.** Destructive DDL must never ride in the same PR as the code
that stops using the column. If it does, a failed or reverted deploy leaves production running code
that queries columns the migration already destroyed — and there is no way back.

Renames are not an exception; they are a drop wearing a disguise. Rename by adding the new column,
backfilling it, shipping code that reads it, and dropping the old one later — the same four phases.

### Which DDL is safe

Three verdicts. **Safe** — old code survives it and it cannot behave differently against production
rows. **Contract only** — it destroys something, so it belongs in phase 4 and nowhere else.
**Empty-table trap** — it succeeds against a fresh database and can fail or narrow against a
populated one, so a clean local run proves nothing about it.

| Statement                                                      | Verdict                     |
| -------------------------------------------------------------- | --------------------------- |
| `CREATE TABLE` (including `NOT NULL` columns)                  | safe — no rows yet          |
| `CREATE INDEX` (non-unique)                                    | safe                        |
| `CREATE UNIQUE INDEX` on a table created in the same migration | safe — no rows yet          |
| `CREATE VIEW`, `CREATE TRIGGER`                                | safe                        |
| `ALTER TABLE ... ADD COLUMN <name> <type>` (nullable)          | safe                        |
| `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT <const>`      | safe — rows get the default |
| `INSERT` / `UPDATE` backfills                                  | safe                        |
| `ALTER TABLE ... ADD COLUMN ... NOT NULL` (no default)         | **empty-table trap**        |
| `CREATE UNIQUE INDEX` on a pre-existing table                  | **empty-table trap**        |
| `ALTER TABLE ... DROP COLUMN`                                  | **contract only**           |
| `DROP TABLE`                                                   | **contract only**           |
| `ALTER TABLE ... RENAME COLUMN` / `RENAME TO`                  | **contract only**           |

### The empty-table trap

Two statements pass against a database built fresh from `/migrations` and can still fail against
production. They share a cause: **the thing that makes them dangerous is existing rows, and a
freshly built database has none.**

```sql
-- 1. NOT NULL with no default.
-- Empty table:                     succeeds silently.
-- One existing row:                Cannot add a NOT NULL column with default value NULL
ALTER TABLE t ADD COLUMN required_field TEXT NOT NULL;

-- 2. A unique index over data that is not actually unique yet.
-- Empty table:                     succeeds silently.
-- Two rows sharing (a, b):         UNIQUE constraint failed: t.a, t.b
CREATE UNIQUE INDEX idx ON t (a, b);
```

`IF NOT EXISTS` does **not** rescue the second one — the index does not exist, so SQLite proceeds
to build it and hits the duplicate. `0011_bootstrap_scheduled_reminders.sql` is this exact shape: a
unique index added to `scheduled_reminders`, a table created back in `0009`. Whether a statement
like that applies cleanly depends on the rows in the database, not on anything the SQL says.

The unique index carries a second hazard the `NOT NULL` case does not: **even when it succeeds it
narrows the schema.** Old code still writing what used to be legal duplicates starts failing the
moment the index exists — during precisely the window where old code is running against new schema.
A unique index on an existing table therefore belongs at phase 3 or later, after the code that
would violate it is no longer deployed, and it needs the data checked first.

To add a genuinely required column: add it nullable, backfill it, and enforce the requirement in the
domain layer. A `NOT NULL` constraint added after the fact requires a table rebuild in SQLite, which
is a contraction — phase 4, later PR.

### Adding a foreign-key column

Add it nullable, like any other column. Both existing examples do —
`0004_maintenance_tasks.sql` and `0014_asset_sharing.sql` — and the reason is the ordinary one:
existing rows have no value to point at, so a required FK on a populated table has the same problem
as any other `NOT NULL` addition.

### Migration files

- Sequentially numbered, `NNNN_snake_case_description.sql`, never renumbered or edited once merged
  — `wrangler` tracks applied migrations by filename in the `d1_migrations` table, so editing a
  merged file changes nothing in an environment that already ran it while silently diverging from
  one that has not.
- A migration that got the schema wrong is fixed by a **new** migration, not by rewriting history.
- Applied locally with
  `pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations apply pineapple --local`.

## Enforcement

ADR-0017 decided this rule is **enforced in CI by a blocking gate**, with an override for the
legitimate contraction case. While this spec's status is `review`, that gate is not live and the
rule holds on author discipline alone — with `required_approving_review_count: 0` and auto-merge on
`main`, nothing else stands behind it.

Enforcement takes two checks, and one bounds what the other can promise:

- **Applying every migration in order to a clean database** proves the SQL is valid and correctly
  ordered.
- **Reading the SQL** is the only way to reach destructive DDL and the empty-table trap, because a
  clean database has no rows for either to go wrong against.

**A green migration check is therefore never clearance for the empty-table trap.** Whatever
automation exists, those two statements stay the author's responsibility.

## Feature Integration Contract

Every feature that changes the database must:

- **State which phase it is in.** A feature PR is expanding, backfilling, shipping, or contracting.
  If it is doing more than one of expand and contract, it is doing too much.
- **Keep the old shape readable** until the code that reads it is no longer deployed.
- **Add columns nullable**, and enforce required-ness in the domain layer rather than with a
  `NOT NULL` constraint added to a populated table.
- **Check the data before adding a unique index** to a table that already has rows, and add it no
  earlier than phase 3.
- **File the contraction as an issue** when shipping the expansion, so phase 4 is tracked rather
  than remembered. Per [`docs/README.md`](../../README.md), that follow-up lives in the issue
  tracker, not as a TODO in the migration file.
- **Justify any contract-phase statement** in the PR body — which deploy made the column unused,
  and how that was confirmed.

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **Contracting in the same PR as the code that stops reading the column.** The single failure this
  spec exists to prevent. The migration runs before the deploy, so a deploy failure leaves live
  code querying a column that no longer exists.
- **`ALTER TABLE ... ADD COLUMN ... NOT NULL` with no default.** Passes against every empty
  database; fails against production. Add it nullable and enforce the rule in the domain.
- **Adding a unique index to a populated table without checking the data.** Same trap, and it also
  narrows the schema under old code that is still writing duplicates.
- **Renaming a column in place.** A rename is a drop plus an add with no migration path for code
  that has not been redeployed yet.
- **Editing a migration that is already merged.** Environments that already applied it will never
  see the change, so the schema silently diverges by environment. Write a new migration.
- **Treating "it applied cleanly locally" as evidence.** A local database is built fresh from these
  same files, so it shares every blind spot production does not.

## Known Issues

- **Nothing enforces phase 4 ever happens.** Columns that went unused at phase 3 can linger
  indefinitely. Filing the contraction issue at expansion time is the only guard, and it is a human
  one.
- **A unique index on an existing table cannot be judged from the SQL alone.** Whether it is safe
  depends on the rows, so no static check can clear it. It stays an author obligation regardless of
  what automation exists.
