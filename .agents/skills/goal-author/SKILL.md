---
name: goal-author
description: Turn a milestone outcome into a hardened goal doc whose feature slices reference accepted intents, bug slices reference corrective issues, and all behavioral slices have specs plus live-verified evidence commands before an autonomous goal loop starts.
---

Goal hardening pre-flight. The autonomous loop is only as safe as the goal doc
it pins: weak criteria and unverified checks are where reward hacking enters
(see `docs/goals/README.md` and the
[goal epic](https://github.com/snaveevans/pineapple/issues/261)). This skill
spends human attention where it compounds — before the run, not during it.

**Input:** a one-paragraph outcome from the user, or an existing goal doc to
revise (only when no loop is running — docs are hash-pinned mid-loop).

**Output:** `docs/goals/<yyyy-mm>-<name>.md` at `status: review`, accepted ready
packets for feature/change slices, issue-backed spec updates for bug slices, a
GitHub Milestone with slice issues, and a baseline verification the user
approves.
You do NOT start the loop — the user runs `/goal` after approving.

## 1. Interrogate the outcome

Work conversationally; do not draft until this is complete.

- **End state in one sentence.** What is true when this goal is done? Push back
  on verbs like "support" / "improve" — demand the observable state.
- **Personas & scenarios (light).** Goals span features; detailed intent and
  persona work belongs to the intent ready-gate workflow per behavior. Here:
  who notices the goal is done,
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

- Which behaviors already have accepted intents and specs? Reference them—do
  not duplicate.
- Which need a new capability or deliberate behavior change? For each one,
  use `docs/intents/INTENTS.md` to complete intent and architecture/ADR planning,
  and obtain the explicit ready approval before invoking `spec-author`. The
  mandatory order is intent planning → ready approval → detailed spec; the later
  goal-doc approval does not replace or retroactively supply the intent gate.
- Which are issue-backed bugs? They require the bug issue and an updated spec,
  but no Intent Brief or ready gate.
- A slice without any behavior authority/spec is valid only for pure
  chore/test/infra work with no observable behavior.
- Does an active goal overlap this one? Two loops editing the same area is a
  conflict machine — flag it and resolve before proceeding.

## 3. Decompose into slices

Partition into **independently-landable slices** (scope budget per CLAUDE.md:
~40 files / ~800 net lines is the signal to split). For each: scope, the spec
it lives in, dependencies. Mechanisms (tables, queues, migrations) land as
their own slice **before** the feature that uses them — scope discipline
applies to goals doubly, because the loop will otherwise absorb the split.

Every behavioral slice references a feature spec plus its authority: accepted
Intent Brief for a feature/change, or GitHub issue for a bug. Create the
tracking shell:

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
- **Risk & merge policy** — human evidence verification and explicit merge on
  every agent-authored/product PR; pre-declare expected H/C slices.

## 6. Baseline + approval gate

```bash
pnpm verify
```

Record the result in the verification log as the kickoff baseline. Set
`status: review`.

**Present the goal doc to the user.** Each feature/change slice's intent ready
gate must already be approved; each bug slice must link its issue and updated
spec. This planning approval covers milestone ordering, non-goals, done-when,
and the checks block. Apply edits, re-verify anything that changed, and only
then hand off:

> Goal doc ready: `docs/goals/<name>.md` (review). Milestone #N, slices S1–Sn
> filed. Approve, then start the loop:
> `/goal Execute docs/goals/<name>.md per goal-executor --max <N>`

The loop hash-pins the doc at start — later revisions mean blocking and
restarting, so this approval is deliberate, not ceremonial.
