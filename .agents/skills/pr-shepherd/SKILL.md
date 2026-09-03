---
name: pr-shepherd
description: Open a pull request to the exact same standard every time, then shepherd it until CI is green — fix red checks in up to 3 rounds, and report back to the human when it can't be made green. Use whenever asked to create a PR, open a pull request, ship a branch, shepherd a PR, watch CI, or get CI green. Not for adversarial pre-PR review (validation-gate) or human review comments (pr-respond).
---

# PR shepherd

The always-on path from "branch work is done" to "PR open, CI green — or a clear
report back to the human." Reproduces the same PR standards every run without the
full validation-gate ceremony.

**What this skill is not:** not a replacement for `validation-gate` (adversarial
review, evidence pack, docs pass — use it when asked for the full gate) and not a
replacement for `pr-respond` (human review comments and review threads). This skill
handles PR creation and machine CI only.

## Safe defaults

- **Never merge.** The human owns merge, always. Green CI is not approval.
- Never commit to `main` or a protected branch; never force-push them. The only
  permitted force-push is `git push --force-with-lease` to your **own** feature
  branch after a rebase (see step 1).
- One concern per PR. If the fix loop wants to grow scope, stop — that's a follow-up
  branch, not this PR (scope discipline in `CLAUDE.md`).
- Never push with a known-red local check.

## Workflow

### 0. Preconditions

```bash
git status && git branch --show-current && git fetch origin
```

- On a feature branch. If still on `main`, stop and ask — branch naming follows
  `CLAUDE.md` (`{type}/{issue}-{slug}`), agent-assigned platform branches are exempt.
- Intended work is **committed**. Unrelated dirty paths: include only intended paths
  or stop and ask.
- Capture intent in 1–2 lines from the user request / issue. It drives the PR summary.

### 1. Rebase onto latest `main`

```bash
git rebase origin/main
```

- Resolve mechanical conflicts yourself; a conflict needing a **product** choice is
  an escalation — stop and report.
- Already-pushed branch (check `git rev-parse --abbrev-ref '@{u}' 2>/dev/null`):
  the later push is `git push --force-with-lease` on your own branch.

### 2. Local gate

```bash
pnpm lint && pnpm type-check && pnpm -r test
```

If the API contract changed, regenerate first, then re-run the full gate:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
pnpm --filter @snaveevans/pineapple-web api:types
```

### 3. Open the PR

Follow `.github/pull_request_template.md`. Fill **every** section that applies:

- **Summary:** 1–3 bullets from the captured intent.
- **Related:** `Closes #N` / `Fixes #N` if fully resolving the issue, `Refs #N` for a
  partial slice; drop the section only when no issue exists.
- **Risk:** always filled (see table below) — level, why, and the matching
  human-validation-budget line copied from the template comments.
- **Evidence:** proof the change works — named tests, screenshot, curl/trace, or a
  short manual script. Link artifacts, not vibes.
- **Test plan** and **Spec / AC** when applicable; **Validation gate** section is
  **dropped** (this skill is not the gate).

```bash
git push -u origin <branch>        # new PR; upstream exists → --force-with-lease
gh pr create --fill-first          # then edit body to the template standard
```

### 4. Shepherd CI

Poll — do not block forever:

```bash
gh pr checks                       # every ~60s until terminal
```

- Wait budget: ~20 minutes with no state change → report status ("CI still running;
  say 'keep watching' to continue") rather than hanging the session.
- One flake re-run is allowed per check, only when logs show infra/flake signals
  (runner timeout, network error, known-flaky test). A re-run is not a fix round.
- If a required check never starts (stuck/queued), report after the wait budget.

### 5. Red-CI fix loop (max 3 rounds)

One round = diagnose → fix → verify locally → commit → push → re-poll.

1. `gh pr checks` → identify failing **required** checks.
2. `gh run view <run-id> --log-failed` → read the actual failure, not the title.
3. Fix the root cause. Do not paper over: no skipped tests, no empty catch, no
   lint-disable without a reason — the CI bans in `CLAUDE.md` are the trust boundary.
4. Re-run the local gate (step 2), commit with a clear message, push, re-poll.
5. After 3 rounds still red → **stop and report** (shape below). Do not round 4.

## Report back — stop and tell the human when

- 3 fix rounds exhausted and CI is still red.
- The failure needs a product/architecture decision (contract change, migration
  ordering, cross-PR breakage).
- Fixes would expand scope beyond this PR's one concern.
- CI is stuck or exceeds the wait budget with no terminal state.

## Report shape

End every run with:

```text
PR: <url>
CI: green | red after N rounds | stuck | still running
Tried: <one line per fix round, "none" if green first try>
Blocked on: <failure + why it needs a human>   (only when not green)
Next: <what you need from the human, if anything>
```

## Risk scoring (identical every time)

Baseline = highest matching path floor; semantic elevations only raise it; an agent
override (±1 level) needs a one-line reason and never goes below C. Human may bump.
The full hybrid rules live in `validation-gate` — use those when running the gate.

| Level | Path floors (any match)                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **C** | `migrations/**`                                                                                                                                |
| **H** | `apps/api/src/domain/**`, `apps/api/worker.ts`, `apps/api/wrangler.jsonc`, `packages/shared/**`, `apps/api/src/api/**`, `.github/workflows/**` |
| **M** | `apps/api/src/application/**`, `apps/api/src/infrastructure/**`, `apps/web/src/**` (non-trivial), mixed code + tests                           |
| **L** | `docs/**`, `*.md`-only, test-only, pure chore, generated OpenAPI/schema regen with matching source                                             |

Semantic elevations: auth/session/permissions core, irreversible data backfills, or
security-sensitive secrets handling → **C**; public API/OpenAPI contract change or
sharing/teams access paths → **H**.

Budget lines (copy onto the PR): **L** glance evidence, don't read the diff ·
**M** evidence + escalations, spot-check 1–2 hot files · **H** full review + local
poke on auth/API/data paths · **C** plan must have been human-approved; deep review.

## Relationship to other skills

| Skill             | When it takes over                               |
| ----------------- | ------------------------------------------------ |
| `validation-gate` | User wants the full pre-PR gate before this runs |
| `pr-respond`      | Human review comments / review threads appear    |
| `pr-review`       | Asked for adversarial review of the diff         |
