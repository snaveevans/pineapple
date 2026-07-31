# Spike: CI check for D1 migrations (issue #119)

> Time-boxed spike on branch `claude/issue-119-spike-087h2i`. Throwaway — the
> real implementation lands on its own branch per issue #119's scope. This
> doc answers three questions: wall-clock increase, CI-minute cost, and what
> else is worth knowing before implementing.

## What was measured

All numbers below are from applying the repo's current 15 migrations
(`migrations/0001_initial.sql` … `0015_activity_actor_display_name.sql`, 64 KB
total) to a fresh local D1 with `pnpm wrangler d1 migrations apply pineapple
--local`, run from `apps/api`.

| Operation                                                                        | Time   |
| -------------------------------------------------------------------------------- | ------ |
| `wrangler --version` (bare CLI startup)                                          | 1.65s  |
| `d1 migrations apply` against an already-migrated DB ("No migrations to apply!") | 4.16s  |
| `d1 migrations apply` against a **fresh** DB, all 15 migrations                  | 12.68s |

Fixed Miniflare/D1 bootstrap overhead per wrangler invocation is ~4s
regardless of migration count; the marginal cost of the 15 migrations
themselves is ~8.5s, i.e. **~0.57s per migration** for schema of this size.

Real `verify` job timing, pulled from the last 20 successful `ci.yml` runs on
`main` via the Actions API:

- Median ≈ 74s, range 51-86s (one 356s outlier, likely a cold/contended
  runner — excluded from the range above).
- Per-step breakdown from a representative run: `Set up job` 2s → `checkout`
  1s → `Install pnpm` 3s → `Setup Node` 5s → `Install dependencies` 7s (≈18s
  fixed setup) → `Lint` 19s → `Type-check` 11s → `Test` 18s → mutation
  selftest + 3 drift checks ≈ 4s.

## Wall-clock increase

Depends on where the check is wired:

- **As a new step inside the existing `verify` job** (mirrors how
  `deploy.yml` already runs `wrangler d1 migrations apply --remote`): adds
  the fresh-apply cost directly, **~13-20s**, pushing `verify` from ~74s to
  roughly **85-95s**. This is the number that lands on the PR's critical
  path, since `verify` already gates merge.
- **As a new parallel job** (own checkout + pnpm + node + install + apply,
  ≈18s fixed setup + ≈13s apply ≈ 31s total): runs alongside `verify`'s ~74s,
  so it **does not extend PR wall-clock** in the common case — it finishes
  first. The only added latency is GitHub's runner spin-up (typically
  5-15s), which is negligible for this team's PR concurrency.
- **The destructive-DDL flag** (regex/grep over changed files under
  `migrations/**`, no D1 involved) is <1s either way — free.

Recommendation: wire the migration-apply check as a **step in `verify`**,
not a separate job. At ~13-20s it's cheap enough that the duplicated ~18s of
setup a parallel job would pay isn't worth it — that tradeoff only flips once
this fixture grows into the heavier `vitest-pool-workers` integration-test
setup the issue mentions sharing, which will have its own, larger cost.

## CI minutes

**The repo is public** (confirmed via the GitHub API: `visibility: "public"`,
`private: false`), so GitHub Actions minutes on standard `ubuntu-latest`
runners are **free and unlimited** — billing is not a real constraint here.

For completeness, the compute cost either way is small: `verify` averages
~23 completed runs/month on `main` alone (88 runs since repo creation ~3.8
months ago), with PR runs on top of that. Inline-in-`verify` adds well under
a job-minute per run; a parallel job would add ~0.5 job-minutes per run
(mostly duplicated setup) without serializing with `verify`. Either way,
total added compute is on the order of tens of minutes per month — not worth
optimizing for on a free public-repo plan.

## Other data points worth having before implementing

**1. The "NOT NULL without a default" flag can't rely on the fresh-D1 apply
catching it — SQLite/D1 only rejects that DDL on a populated table.**

This is the most important finding. Tested directly against local D1:

```sql
-- Empty table: succeeds silently.
ALTER TABLE ddl_spike_test ADD COLUMN required_field TEXT NOT NULL;
-- ✅ succeeds, notnull=1, dflt_value=null

-- Same statement, table has 1 row:
ALTER TABLE ddl_spike_test ADD COLUMN required_field TEXT NOT NULL;
-- ✘ ERROR: Cannot add a NOT NULL column with default value NULL
```

CI's fresh D1 is empty by construction — every migration runs against
zero-row tables. So "apply every migration to a fresh D1" will **never**
surface the exact destructive-DDL case the issue calls out (`NOT NULL`
without a default), because the thing that makes it dangerous — existing
rows — is precisely what the fresh-DB check doesn't have. **The
destructive-DDL flag has to be a static/pattern check on the SQL text (grep
for `DROP TABLE`, `DROP COLUMN`, `ADD COLUMN ... NOT NULL` without a
`DEFAULT`), not something the apply step incidentally catches.** The apply
step and the DDL flag are two genuinely separate checks solving different
problems — worth stating explicitly in the policy doc so a future
implementer doesn't assume one covers the other.

**2. "Non-idempotent statement" risk is already handled by wrangler's own
bookkeeping, so the fresh-apply check doesn't need to re-prove it.**
`wrangler d1 migrations apply` tracks applied migrations in a
`d1_migrations` table and skips ones already applied (confirmed above: a
second run against an already-migrated DB does nothing in 4.16s, all
no-ops). Since CI always starts from a truly fresh, un-migrated `.wrangler/state`
(gitignored, confirmed), every migration runs exactly once per CI run either
way. What the fresh-D1 check actually catches is ordering bugs and bad SQL —
worth being precise about in the policy doc rather than overclaiming
idempotency coverage.

**3. No current migration would trip a destructive-DDL flag.** Grepped all
15 files for `DROP TABLE`, `DROP COLUMN`, and `ADD COLUMN ... NOT NULL`:
zero destructive DDL exists today, and all 8 `ADD COLUMN`s already omit `NOT
NULL` (nullable columns, no default needed). So turning the flag on is a
clean cutover — no historical migration needs an exception/allowlist entry.

**4. Growth rate is slow enough that apply time isn't a future concern.**
15 migrations accumulated over ~4 weeks (12 landed together as an initial
import on 2026-07-02, then one every few days since: 07-10, 07-12, 07-13).
At ~0.57s/migration marginal cost, even 100 migrations would add roughly
~55-60s to a fresh apply — noticeable but not alarming, and far off at the
current cadence.

**5. Command and working directory to reuse.** `deploy.yml` already runs the
production equivalent (`working-directory: apps/api`, `pnpm wrangler d1
migrations apply pineapple --remote`) — the CI check is the same command
with `--local` instead of `--remote`, so there's no new pattern to invent,
just `--remote` → `--local` and a different job.

**6. Fixture reusability.** The issue notes this fresh-D1 setup should be
"the same fixture" the future `worker.ts` integration-test work needs
(`vitest-pool-workers`-based, not plain `wrangler` CLI). Worth keeping
whatever script/helper this check uses in a form both can call (e.g. a
`.github/scripts/` script or small shared helper) rather than inlining the
`wrangler` invocation only into the CI YAML, so the integration-test work
doesn't have to reinvent it.
