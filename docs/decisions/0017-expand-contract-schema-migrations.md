# Expand/Contract Schema Migrations

- Status: accepted
- Date: 2026-08-01

## Context and Problem Statement

Every other stage of this pipeline is recoverable. Schema is not.

`deploy.yml` applies pending D1 migrations to production **before** `wrangler deploy` runs, and
that ordering is deliberate — the schema has to be ready before code that reads it goes live. It
opens two windows the deploy cannot close:

- If the Worker deploy fails after the migration succeeds, production sits on **new schema with
  old code**.
- If the deploy succeeds and the code is later rolled back, the schema **stays migrated**. Nothing
  in the rollback path reverts DDL.

For additive, nullable change both windows are harmless: old code ignores a column it does not
know about. For a `DROP COLUMN`, a rename, or a new `NOT NULL` on a populated table, the second
window is unrecoverable — the data is gone, and redeploying the previous Worker restores code that
now queries columns which no longer exist. "Roll back if the smoke test fails" is therefore only
partly true today, and the untrue half is the half that destroys data.

Two conditions sharpen this. First, `main` auto-merges on green CI with
`required_approving_review_count: 0`, so — as [ADR-0016](0016-mutation-testing-as-the-ci-trust-boundary.md)
established — **CI is the entire trust boundary**; there is no reviewer standing between a
destructive migration and production. Second, `/migrations` is the only stage of the pipeline with
**zero** automated coverage: no check applies these files, parses them, or looks at them at all
before `deploy.yml` runs them against the production database.

The question this record answers is **what shape of schema change is permitted, given that the
deploy ordering cannot make schema change reversible** — and how much authority a check enforcing
that shape should have.

This record fixes the rule and its enforcement authority. The exact DDL patterns matched, the
script and workflow wiring, the acknowledgment-comment syntax, and the author checklist are
mechanism and live in the
[Schema Migrations cross-cutting spec](../specs/cross-cutting/schema-migrations.md).

## Decision Drivers

- **Schema change is one-way.** Code deploys are reversible and schema is not, so the two cannot
  be governed by the same "ship it, roll back if it breaks" policy. This dominates the others.
- **CI is the only gate.** With zero required reviewers, a rule nothing enforces is a rule that
  holds only while everyone remembers it — and much of this repo's SQL is agent-authored.
- **The deploy ordering is fixed.** Migrations must precede the Worker deploy. The policy has to
  make that ordering safe rather than fight it.
- **Old code must tolerate new schema.** Both failure windows above put old code in front of new
  schema. Any permitted change must be one that old code survives.
- **Cheap enough to sit on the hot path.** `verify` gates every PR. A check that makes iteration
  slow gets routed around, and a routed-around gate is worse than none.
- **Honest partiality.** Whatever check we adopt will have blind spots. They must be written down,
  not implied away by a green badge.

## Considered Options

- **A. Expand/contract, enforced by CI.** _(chosen)_
- **B. Coupled schema + code deploy behind a maintenance window.**
- **C. Destructive DDL permitted, with database restore as the recovery path.**
- **D. Write the rule as documentation only, enforce nothing.**

## Decision Outcome

Chosen option: **A — expand/contract, enforced by CI.**

**The rule.** A schema change proceeds in phases, and the destructive phase is separated from the
additive one by at least one deploy:

1. **Expand** — add the new column or table, nullable, with no `NOT NULL` and no rename in place.
2. **Backfill** — populate it, in its own migration or at runtime.
3. **Ship** — deploy code that writes and reads the new shape while tolerating the old.
4. **Contract** — in a **later PR, after the new code is live**, drop what is now unused.

The load-bearing constraint is step 4's separation: **destructive DDL never rides in the same PR
as the code that stops using the column.** That is what keeps old code compatible with new schema
across both failure windows, and it is the part a policy without enforcement reliably loses.

**Two independent checks enforce it,** and neither subsumes the other:

- **A fresh-database apply.** Every migration is applied in order to a clean local D1 on every PR.
  This catches ordering bugs and invalid SQL — the failures that would otherwise surface for the
  first time against production. It does **not** prove idempotency; `wrangler` already tracks
  applied migrations in `d1_migrations` and skips them.
- **A static scan of the migration SQL** for destructive DDL — drops, renames, and `NOT NULL`
  added without a default.

That the second check is necessary is not obvious, and the spike that preceded this decision
([#119](https://github.com/snaveevans/pineapple/issues/119)) established it by measurement:
**SQLite rejects `ALTER TABLE ... ADD COLUMN ... NOT NULL` without a default only when the table
is populated.** CI's fresh database is empty by construction, so the apply check succeeds silently
on exactly the statement that would fail against production. A check that can only pass is not a
check. The dangerous case is reachable only by reading the SQL text, so the scan is a separate
mechanism answering a separate question — recorded here because a future maintainer would
otherwise reasonably assume one covers the other and delete the "redundant" one.

**The scan is a hand-rolled script, not a SQL parser.** [Atlas](https://github.com/ariga/atlas)'s
`migrate lint` has purpose-built destructive-change analyzers, treats SQLite as a first-class
dialect, and — unlike a regex — parses the SQL, so it structurally cannot confuse a safe
`CREATE TABLE (... NOT NULL ...)` with a dangerous `ALTER TABLE ADD COLUMN ... NOT NULL`. It was
weighed seriously and rejected on cost, not merit: it introduces a Go binary into an otherwise
pnpm/Node-only pipeline and wants an `atlas.sum` checksum file, adding another
generated-artifact-plus-drift-check pair. Against 15 small, self-authored, always-reviewed
migrations, a ~15-line script matching the existing `mutation-scope.sh` convention buys most of
the value for an hour of work. **This is a deliberate trade, not an oversight**, and Atlas is the
named upgrade path — see the revisit trigger.

**The scan blocks, and its escape hatch is in-file.** Blocking follows ADR-0016's reasoning
directly: with no human reviewer, an advisory warning is a notification arriving after the merge it
should have stopped. Contraction is legitimate and expected, so the gate needs an override — but
it is an in-file acknowledgment comment on the statement, not a PR label. The distinction is
structural, not stylistic: the scan reads _every_ migration on _every_ run rather than diffing
against a base ref, which is what keeps it simple and fail-closed. A label expires with the run
that carried it, so the first acknowledged destructive migration to land would leave the scan
permanently red. An in-file marker makes the approval durable and leaves the reason next to the SQL
it excuses, where the next reader will find it.

### Revisit Trigger

Reconsider if the migration SQL diversifies past what a line-oriented regex can honestly read —
multi-line `ALTER` statements, generated SQL, or DDL keywords appearing inside string literals — at
which point false negatives become likely and Atlas's parser earns its cost. Also reconsider if the
deploy ordering changes such that schema and code can ship atomically, or if a human review
requirement is introduced, since that would mean CI is no longer the sole trust boundary.

### Positive Consequences

- The unrecoverable case is designed out rather than guarded against: after a contraction lands,
  the column it dropped has already been unused in production for at least one deploy.
- `/migrations` gains its first automated coverage of any kind, on the stage where mistakes are
  least reversible.
- Rollback becomes an honest story, which is the prerequisite [#89](https://github.com/snaveevans/pineapple/issues/89)'s
  runbook needs to be worth writing.
- Turning the scan on is a clean cutover: no current migration contains a drop, a rename, or a
  `NOT NULL` addition, so no allowlist or grandfathered exception is required — and the gate is
  therefore never introduced already-suppressed.
- The fresh-apply fixture is the same setup the future `worker.ts` integration tests need, so it
  is built once.

### Negative Consequences

- **Schema change now takes at least two PRs and two deploys.** For a two-person team this is real
  friction on a change that used to be one file, and the second PR is the one everyone forgets —
  the tail of dropped-but-never-contracted columns is a cost this policy accepts.
- **The scan is a regex, and a regex is not a parser.** It cannot distinguish a `DROP TABLE`
  keyword from `'DROP TABLE'` inside a quoted default, cannot follow a statement reformatted across
  lines, and reads only what the current SQL style makes visible. Its sufficiency is a bet on the
  team and its agents continuing to write SQL in the present shape — not a structural guarantee.
- **The acknowledgment comment can be applied thoughtlessly.** With no required reviewer, nothing
  stops an author — or an agent — from silencing the gate rather than restructuring the change.
  The comment makes that visible in the diff and permanent in the file; it does not prevent it.
- Every PR pays the fresh-apply cost, including the large majority that touch no migration at all,
  and that cost grows with the migration count.
- The gate says nothing about whether a migration is _correct_ — only that it applies cleanly and
  destroys nothing. A well-formed migration encoding the wrong model still ships.

---

## Pros and Cons of the Options

### A. Expand/contract, enforced by CI

- Good, because it is the only option that makes the deploy ordering safe instead of merely
  documenting that it is dangerous.
- Good, because it keeps old code compatible with new schema, which is precisely the state both
  failure windows produce.
- Good, because enforcement does not depend on a reviewer this repo does not have.
- Good, because it is standard, well-understood practice, so agents and future contributors are
  likely to recognize the shape without being taught it.
- Bad, because it doubles the PR count for any change that removes something.
- Bad, because the enforcing check is pattern matching, with blind spots that cannot be closed
  without a real parser.

### B. Coupled schema + code deploy behind a maintenance window

- Good, because it eliminates the mixed-version window entirely: nothing serves traffic while
  schema and code disagree.
- Good, because a destructive change stays a single PR, keeping the change set small and legible.
- Bad, because it does not solve the actual problem — a failed or reverted deploy still leaves the
  schema migrated, and the window it closes is not the window that destroys data.
- Bad, because it requires downtime tooling and a rehearsed procedure that do not exist here, for
  an app whose deploys are currently a merge.

### C. Destructive DDL permitted, with database restore as the recovery path

- Good, because it imposes no process cost at all until something actually goes wrong.
- Good, because D1 does offer point-in-time restore, so the capability is genuinely there.
- Bad, because restore is whole-database: recovering a mistakenly dropped column also discards
  every write since the restore point, trading a schema problem for a data-loss problem.
- Bad, because it converts a preventable error into an incident requiring a correct, timed,
  never-rehearsed response from a two-person team.
- Bad, because it is effectively the status quo, and the status quo is what this record exists to
  change.

### D. Write the rule as documentation only, enforce nothing

- Good, because it costs nothing to adopt and adds no CI time.
- Good, because it captures the reasoning, which is most of the value for a human who reads it.
- Bad, because with no required reviewer, an unenforced rule is checked by whoever happens to
  remember it — and much of this SQL is written by agents working from whatever context they load.
- Bad, because it would leave `/migrations` with zero coverage, which is the specific gap that
  makes the rollback story dishonest.
- Not mutually exclusive with A: the documentation is written either way. The question is only
  whether anything checks it.
