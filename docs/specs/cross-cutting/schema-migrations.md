---
audience: all contributors
purpose: how D1 schema changes are staged so a code rollback never leaves production broken
source: this file
date: 2026-08-01
---

# Schema Migrations — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** Every change that adds or edits a file in `/migrations`

> The rule is expand/contract, decided in
> [ADR-0017](../../decisions/0017-expand-contract-schema-migrations.md). The two CI checks that
> enforce it are tracked by [#119](https://github.com/snaveevans/pineapple/issues/119) and land in
> a follow-up PR — see [Enforcement](#enforcement) for what is and is not automated today.

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

| Statement                                                 | Verdict                                        |
| --------------------------------------------------------- | ---------------------------------------------- |
| `CREATE TABLE` (including `NOT NULL` columns)             | **safe** — the table has no rows yet           |
| `CREATE INDEX`, `CREATE VIEW`, `CREATE TRIGGER`           | **safe**                                       |
| `ALTER TABLE ... ADD COLUMN <name> <type>` (nullable)     | **safe**                                       |
| `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT <const>` | **safe** — every existing row gets the default |
| `INSERT` / `UPDATE` backfills                             | **safe**                                       |
| `ALTER TABLE ... ADD COLUMN ... NOT NULL` (no default)    | **requires acknowledgment**                    |
| `ALTER TABLE ... DROP COLUMN`                             | **requires acknowledgment**                    |
| `DROP TABLE`                                              | **requires acknowledgment**                    |
| `ALTER TABLE ... RENAME COLUMN` / `RENAME TO`             | **requires acknowledgment**                    |

"Requires acknowledgment" means the statement is legitimate at phase 4 — it is how contraction
happens — but it must be an explicit, recorded decision rather than something that slips through
unnoticed. See [Enforcement](#enforcement).

### Why `NOT NULL` without a default is the subtle one

SQLite rejects `ALTER TABLE ... ADD COLUMN ... NOT NULL` with no default **only when the table
already has rows**:

```sql
-- Against an empty table: succeeds silently.
ALTER TABLE t ADD COLUMN required_field TEXT NOT NULL;   -- ok

-- The identical statement, against a table with one row:
ALTER TABLE t ADD COLUMN required_field TEXT NOT NULL;   -- Cannot add a NOT NULL column with default value NULL
```

A local or CI database created fresh from `/migrations` is empty at the moment each migration runs,
so this statement passes every test that applies migrations to a clean database — and then fails
against production, where the rows are. **Applying migrations somewhere cannot catch this.** Only
reading the SQL can. This is why enforcement is two checks rather than one.

To add a genuinely required column: add it nullable, backfill it, and enforce the requirement in
the domain layer. A `NOT NULL` constraint added after the fact requires a table rebuild in SQLite,
which is a contraction — phase 4, later PR.

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

**Today this rule is enforced by review, not by CI.** `/migrations` currently has no automated
coverage of any kind. Two checks close that gap, tracked by
[#119](https://github.com/snaveevans/pineapple/issues/119):

| Check                                        | Answers                                | Cannot answer                    |
| -------------------------------------------- | -------------------------------------- | -------------------------------- |
| Apply every migration in order to a fresh D1 | Does this SQL run, in this order?      | Anything requiring existing rows |
| Static scan of the migration SQL             | Does this destroy or narrow something? | Whether the SQL is valid         |

**These are two checks solving two problems, and neither is redundant with the other.** The fresh
apply catches ordering bugs and invalid SQL. It does _not_ prove idempotency — `wrangler` already
skips migrations recorded in `d1_migrations`, so idempotency is not the fresh apply's contribution
— and it structurally cannot catch the `NOT NULL` case above, because its database is empty. If a
future change makes one of these look redundant, re-read that paragraph before deleting it.

The scan blocks rather than warns, because with `required_approving_review_count: 0` on `main` an
advisory warning arrives after the merge it should have stopped (same reasoning as
[ADR-0016](../../decisions/0016-mutation-testing-as-the-ci-trust-boundary.md)). Its override is an
**in-file acknowledgment comment** on the statement, carrying a reason — durable, and sitting next
to the SQL it excuses. Not a PR label, which would expire with the run that carried it.

## Feature Integration Contract

Every feature that changes the database must:

- **State which phase it is in.** A feature PR is expanding, backfilling, shipping, or contracting.
  If it is doing more than one of expand and contract, it is doing too much.
- **Keep the old shape readable** until the code that reads it is no longer deployed.
- **Add columns nullable**, and enforce required-ness in the domain layer rather than with a
  `NOT NULL` constraint added to a populated table.
- **File the contraction as an issue** when shipping the expansion, so phase 4 is tracked rather
  than remembered. Per [`docs/README.md`](../../README.md), that follow-up lives in the issue
  tracker, not as a TODO in the migration file.
- **Justify any acknowledged destructive statement** in the PR body — which deploy made the column
  unused, and how that was confirmed.

## Exceptions

| Feature | Deviation | Reason                                                                                                                                   |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| —       | —         | No current migration contains a drop, a rename, or a `NOT NULL` addition. The rule starts from a clean slate with nothing grandfathered. |

## Anti-Patterns

- **Contracting in the same PR as the code that stops reading the column.** The single failure this
  spec exists to prevent. The migration runs before the deploy, so a deploy failure leaves live
  code querying a column that no longer exists.
- **`ALTER TABLE ... ADD COLUMN ... NOT NULL` with no default.** Passes locally and in CI against
  empty tables; fails against production. Add it nullable and enforce the rule in the domain.
- **Renaming a column in place.** A rename is a drop plus an add with no migration path for code
  that has not been redeployed yet.
- **Editing a migration that is already merged.** Environments that already applied it will never
  see the change, so the schema silently diverges by environment. Write a new migration.
- **Acknowledging a destructive statement to get CI green.** The acknowledgment records a decision
  someone made; it is not a way to skip making one. If the column is still being read, the answer
  is to wait a deploy, not to annotate the drop.
- **Reading a green migration check as "this migration is correct."** It says the SQL applies and
  destroys nothing. It says nothing about whether the schema models the right thing.

## Known Issues

- **The static scan will be pattern matching, not SQL parsing.** It cannot distinguish a
  `DROP TABLE` keyword from `'DROP TABLE'` inside a quoted string, and will not see a statement
  reformatted across multiple lines. Every migration is single-line-per-statement today, which is
  what makes this viable; ADR-0017 names [Atlas](https://github.com/ariga/atlas) as the upgrade
  path if that stops being true.
- **Nothing enforces that phase 4 ever happens.** Columns that went unused at phase 3 can linger
  indefinitely. Filing the contraction issue at expansion time is the only guard, and it is a
  human one.
- **The fresh-apply cost grows with the migration count** — roughly half a second per migration on
  top of a fixed few seconds of D1 bootstrap. Not a concern at the current count or growth rate.
