---
name: validation-gate
description: Take finished branch work through a no-mistakes-inspired gate — rebase, adversarial review, tests, docs, risk score, evidence, and a clean PR — then babysit CI. Use when asked to gate a change, run validation-gate, no-mistakes style checks, prepare a PR with risk, or hand off after implementation.
---

# Validation gate

Semi-automated quality gate between "agent says done" and "human judges the PR."

Inspired by Kun Chen's **no-mistakes** pipeline, but built on this repo's existing
skills (`pr-review`, `pr-respond`, `/pr`) rather than a separate push remote. Automation
will deepen over time; today the human owns the **merge** — the agent commits and
pushes its own branch autonomously, and stops at merge for explicit approval.

**Phone-friendly by design.** Outputs live in the PR body (risk, evidence, escalations) —
not in a desktop-only UI. Lavish is optional laptop polish for planning; it is not part of
this gate.

## What this skill is not

- Not a replacement for `pr-review` or `pr-respond` — it **orchestrates** them.
- Not a license to merge without explicit user approval.
- Not full unattended merge. Human validation budget still scales with **Risk**.

## When to run

- After implementation, before or instead of a bare `/pr`
- When the user says "gate this", "validation-gate", or "no-mistakes this"
- As the verify→PR tail of `issue-implement` when the user wants the fuller gate

## Pipeline

Run steps in order. Stop on a hard failure unless the user waives it. Record what you
did; the PR body is the audit trail.

### 0. Preconditions

```bash
git status
git branch --show-current
git fetch origin
```

- Must **not** be on `main`.
- **Commit intended work before rebasing.** A finished-but-uncommitted tree is the
  normal post-implementation state, and step 1's rebase + step 2's review both need
  a committed branch diff to operate on. Committing the branch is autonomous (no
  approval needed) — just don't commit to `main`. Do not stash-and-rebase to skip
  this; the review has nothing to review without a commit.
- No unrelated dirty files. If unrelated paths are dirty, include only intended paths
  or stop and ask.
- Capture **intent** in 2–4 lines from: user request, issue body, accepted plan/spec
  slice, and recent session decisions. This intent drives review and evidence — not
  "whatever the diff happens to do."

State branch, base (`origin/main`), and intent in one short block before continuing.

### 1. Rebase onto latest main

```bash
git fetch origin
git rebase origin/main
```

- Resolve conflicts yourself when mechanical.
- If resolution needs a **product** choice, stop and escalate (list options).
- **Already-pushed branch:** rebasing rewrites SHAs the remote already has, so
  updating the PR (step 7) needs `git push --force-with-lease` instead of a fast-forward.
  That force-push to your own feature branch is autonomous (the branch is yours to
  rewrite). Detect with `git rev-parse --abbrev-ref '@{u}' 2>/dev/null`. Never force-push
  `main` or a protected branch, and never rewrite a branch someone else is actively
  reviewing without an explicit ask.

### 2. Fresh-context adversarial review

Invoke the `pr-review` skill on the **current branch diff** against `main` (not only a
same-session reread of your own commits). Goal: catch issues a second agent would see.

- Findings the skill would score 80+: **fix** when safe and mechanical (lint-shaped,
  obvious bugs, missing await, wrong import layer you introduced).
- Findings that change product behavior, API contract, or UX: **do not silently fix** —
  add to **Escalations**.
- Re-run review after fixes if you changed code.

If `pr-review` posts only on PR targets, keep branch-diff findings in-session and fold
the survivors into the PR body's escalations / follow-ups.

### 3. Verify (local CI shape)

```bash
pnpm lint && pnpm type-check && pnpm -r test
```

If the API contract changed:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
pnpm --filter @snaveevans/pineapple-web api:types
```

Then re-run the full check. Do not open a PR with a known-red branch.

### 4. Docs pass

Against the captured intent and the diff:

- Spec AC boxes for the slice this PR implements (`[ ]` → `[x]` only if tested)
- `docs/web/FEATURES.md` if web flows/screens changed meaningfully
- No hand-edited `openapi.json` / `apps/web/src/api/schema.ts`
- No field tables in `data-model.md` that duplicate the OpenAPI spec

### 5. Score risk (hybrid)

Compute a **path-glob baseline** from `git diff --name-only origin/main...HEAD`, apply
**semantic elevations**, then allow an **agent override** (up or down one level) with a
one-line reason. Human may bump again on the PR.

**Path-glob baseline** (highest matching floor wins):

| Level | Any matching path                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C** | `migrations/**`                                                                                                                                                           |
| **H** | `apps/api/src/domain/**`, `apps/api/worker.ts`, `apps/api/wrangler.jsonc`, `packages/shared/**`, `apps/api/src/api/**` (OpenAPI schemas/contract), `.github/workflows/**` |
| **M** | `apps/api/src/application/**`, `apps/api/src/infrastructure/**`, `apps/web/src/**` (non-trivial), a diff that mixes code + tests                                          |
| **L** | `docs/**`, `*.md`-only, test-only, pure chore, generated OpenAPI/schema regen **with** matching source, dependency lockstep already covered by CI                         |

**Semantic elevations** (raise the baseline; never lower it). Use when a signal isn't
captured by the path the code lives in:

| Raises to | Signal                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| **C**     | auth/session/permissions core logic, irreversible data backfills, security-sensitive crypto/secrets handling          |
| **H**     | public API / OpenAPI contract change, `permissions` / sharing / teams access paths, agent listed a product escalation |

Baseline = max(path-glob floor, semantic elevation).

**Override rules:**

- Never override **below C** if a C path-glob **or** a C semantic signal matched.
- Override **up** when intent is product-ambiguous, blast radius is unclear, or evidence is thin.
- Override **down** one level only when the diff is narrower than the baseline suggests
  (e.g. a comment-only touch under `domain/**` or `worker.ts`) — say why. Down-override
  is forbidden past C.

**Human validation budget** (copy onto the PR):

| Level | Budget                                                    |
| ----- | --------------------------------------------------------- |
| **L** | Glance evidence. Do not read the diff.                    |
| **M** | Evidence + escalations; spot-check 1–2 hot files.         |
| **H** | Full review + local poke on auth/API/data paths.          |
| **C** | Plan must have been human-approved; deep review required. |

### 6. Evidence pack

Attach proof that the change meets **intent**, not merely that tests passed.

Prefer, in order:

1. Named tests that exercise the behavior (file + test name)
2. Web: state-gallery / Playwright / screenshot paths when UI changed (see #145 /
   `test/145-web-state-gallery` when present)
3. API: curl/trace or vitest integration output for the contract path
4. Manual steps with expected results (last resort; keep short)

Thin evidence on an **H/C** change is itself an escalation: say what's missing.

### 7. Open or update the PR

Follow `.github/pull_request_template.md` and `CLAUDE.md` → Opening a PR.

Fill **every** section that applies:

- Summary, Related, Risk, Evidence, Test plan, Spec/AC, Validation gate, Escalations

Use the `/pr` command conventions (issue link mode).

Push path depends on whether the branch is already on the remote:

- **New PR** (no upstream): `git push -u origin <branch>`, then `gh pr create`.
- **Update after rebase** (upstream exists; step 1 flagged this): `git push --force-with-lease`
  on your own feature branch. This is the one force-push the gate performs; it follows
  from the step-1 rebase, not a separate ask. Never force-push `main` or a protected branch.

**Gate:** Commit and push the branch autonomously. Do not **merge** without explicit
user approval.

### 8. Babysit CI (optional pass)

After the PR exists and CI has run:

- Green → report URL + risk + what the human should do per budget.
- Red → invoke `pr-respond` for failing checks only (same ownership rules).
- Re-score risk if the fix round materially grew scope.

Do not merge unless the user asks.

## Report shape

End with a tight block:

```text
Branch: …
Intent: …
Risk: L|M|H|C — reason
Evidence: …
Escalations: none | …
PR: url or "not opened — <reason>"
Human budget: <one line from the table>
Next: <what you need from the human, if anything>
```

## Relationship to other skills

| Skill             | Role under this gate                          |
| ----------------- | --------------------------------------------- |
| `pr-review`       | Step 2 adversarial review                     |
| `pr-respond`      | Step 8 CI / review thread handling            |
| `issue-implement` | May hand off here instead of a bare verify→PR |
| `/pr`             | Step 7 mechanics                              |

## Evolution

v1 (this file): orchestrated checklist + hybrid risk + PR template audit trail.
Later: deeper automation (isolated worktree, push gate, richer evidence upload) without
changing the human-facing Risk budget contract.
