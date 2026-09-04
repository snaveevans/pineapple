---
name: goal-author
description: Turn a one-paragraph outcome into a hardened, executable goal doc — decomposed into slices/specs/issues, with live-verified validation commands, before any autonomous goal loop starts. Use when starting milestone work, authoring a goal, or preparing a /goal run.
---

Goal hardening pre-flight. The autonomous loop is only as safe as the goal doc
it pins: weak criteria and unverified checks are where reward hacking enters
(see `docs/goals/README.md` and the
[goal epic](https://github.com/snaveevans/pineapple/issues/261)). This skill
spends human attention where it compounds — before the run, not during it.

**Input:** a one-paragraph outcome from the user, or an existing goal doc to
revise (only when no loop is running — docs are hash-pinned mid-loop).

**Output:** `docs/goals/<yyyy-mm>-<name>.md` at `status: review`, a GitHub
Milestone with slice issues, and a baseline verification the user approves.
You do NOT start the loop — the user runs `/goal` after approving.

## 1. Interrogate the outcome

Work conversationally; do not draft until this is complete.

- **End state in one sentence.** What is true when this goal is done? Push back
  on verbs like "support" / "improve" — demand the observable state.
- **Personas & scenarios (light).** Goals span features; deep persona work
  belongs to `spec-author` per feature. Here: who notices the goal is done,
  and what can they do that they couldn't before?
- **Non-goals.** Ask explicitly: "what should this goal NOT touch?" Non-goals
  are what stops the loop absorbing drift.
- **Known risks.** Anything the user already knows is H/C-risk (auth, schema,
  contracts)? It goes in Risk & merge policy up front.

## 2. Map the landscape

```!
echo "── Feature specs ──"
ls docs/specs/features/*.md 2>/dev/null | xargs -I{} basename {}
echo "── Existing goals ──"
ls docs/goals/*.md 2>/dev/null | grep -v template | grep -v README
echo "── Open milestones ──"
gh api repos/:owner/:repo/milestones --jq '.[] | "\(.number) \(.title) (open: \(.open_issues))"' 2>/dev/null || echo "(gh unavailable)"
```

- Which behaviors already have specs? Reference them — do not duplicate.
- Which need new or revised specs? Each becomes a `spec-author` delegation
  (Greenfield or Revise) before the goal doc reaches `review`. A slice without
  a spec is fine only for pure chore/test/infra work with no product behavior.
- Does an active goal overlap this one? Two loops editing the same area is a
  conflict machine — flag it and resolve before proceeding.

## 3. Decompose into slices

Partition into **independently-landable slices** (scope budget per CLAUDE.md:
~40 files / ~800 net lines is the signal to split). For each: scope, the spec
it lives in, dependencies. Mechanisms (tables, queues, migrations) land as
their own slice **before** the feature that uses them — scope discipline
applies to goals doubly, because the loop will otherwise absorb the split.

Create the tracking shell:

- GitHub Milestone titled after the goal
- One issue per slice (`Refs #<epic-or-milestone>`, `ready-for-dev` label when
  the spec slice is unblocked)

## 4. Author done-when + the checks block

**Criteria:** EARS-style ("When X, the system shall Y"), each tagged with one
slice. Derive from scenarios, not implementation. A criterion that resists a
validation command gets split or moved to a spec — never left vague.

**Checks block** (format contract with the `/goal` plugin):

- **Line 1: the enforced milestone check.** Default `pnpm verify`. This is what
  the loop itself runs on every completion claim — it must be repo-universal,
  fast enough to run every ~5 iterations, and impossible to satisfy vacuously.
- **Then, one commented line per criterion:** `# S1: <short criterion> → <command>`
- Commands must be **deterministic and self-contained** (test files, scripts,
  `pnpm` commands). No curl-to-prod, no manual steps, no "ask the user".

**Live-verify every command — this step is the point of the skill:**

1. **Green today:** run each command on a clean tree. Record the result.
2. **Fails when broken:** for criteria pinning existing behavior, demonstrate
   the command _fails_ when the behavior breaks — invert a condition, delete a
   line, or point the command at a mutated copy. If you can't break it without
   breaking the command itself, the command is too weak — replace it. (This is
   the testing spec's "a mutation would break it" standard, applied to goals.)
3. **Pending by design:** criteria for unimplemented slices get their commands
   written now and marked `# pending (S2 not yet implemented)` — but the
   milestone check (line 1) must be green _today_.

## 5. Escalation classes, protected paths, risk

Fill the template sections from the defaults; adjust per goal:

- **Escalation classes** — copy template defaults; remove entries the goal
  genuinely doesn't need; add goal-specific ones (e.g. "touching the
  notification outbox schema").
- **Protected paths** — built-in defaults only unless the goal truly needs
  extras (e.g. `migrations/**` for a schema goal). Extras are justified in one
  line each.
- **Risk & merge policy** — state the policy in force (human merge until
  ADR-0018 activates) and pre-declare expected H/C slices.

## 6. Baseline + approval gate

```bash
pnpm verify
```

Record the result in the verification log as the kickoff baseline. Set
`status: review`.

**Present the goal doc to the user.** This is the one human gate worth its
cost: they read the outcome, non-goals, done-when, and checks block — not the
scaffolding. Apply their edits, re-verify anything that changed, and only then
hand off:

> Goal doc ready: `docs/goals/<name>.md` (review). Milestone #N, slices S1–Sn
> filed. Approve, then start the loop:
> `/goal Execute docs/goals/<name>.md per goal-executor --max <N>`

The loop hash-pins the doc at start — later revisions mean blocking and
restarting, so this approval is deliberate, not ceremonial.
