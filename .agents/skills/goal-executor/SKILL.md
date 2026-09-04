---
name: goal-executor
description: Execute a goal doc slice by slice — test-first implementation, validation gate, PR, verification log — stopping only at the goal's escalation classes. Use when a goal doc is approved (status: review/active) and the loop should run, or when resuming one.
---

The per-slice pipeline a goal loop runs. The `/goal` plugin owns the loop
discipline (re-prompting, the pinned check, tamper audit); **this skill owns
what one iteration of real work looks like**. The goal doc is the destination;
deterministic gates are the only evidence.

**Input:** a goal doc path (e.g. `docs/goals/2026-09-<name>.md`), or detect the
single doc under `docs/goals/` with unchecked criteria. If `status` is not
`review`/`active`, stop — `goal-author` hasn't finished.

## 0. Orient

Read the goal doc end to end. Restate in one block: goal, slices with status
(from Done-when tags + the Delivery Plan + the verification log), the enforced
check, escalation classes, and the merge policy in force. A cold agent must be
able to do exactly this — never resume from memory of a previous session.

Confirm the loop context: if the session is not running under `/goal`, say so
and suggest the kickoff command; still proceed slice-by-slice either way.

## 1. Pick the next slice

The next `Sn` whose Done-when boxes are all `[ ]`, whose Delivery Plan
dependencies are all landed (log shows their PRs), and whose spec — if any —
has no unchecked boxes in _earlier_ slices. If two are eligible, take the lower
number; if the goal author left the order genuinely ambiguous, decide and say
why in the log.

## 2. Blind acceptance tests — mandatory, first

Invoke the `test-author` skill **before** any implementation exists in context:
produce the failing tests for this slice's criteria from the goal doc + spec
alone.

- The implementer (you, next step) may **add** tests but must never modify,
  delete, or narrow these assertions regardless of outcome — the tamper audit
  surfaces violations and this skill treats hiding one as an escalation.
- If `test-author` finds a criterion untestable as written, that is a **stop**:
  the criterion is defective (can't name a live-verified command and a test).
  Emit `[[GOAL_BLOCKED]]` under `/goal` — the doc is pinned; it needs a human
  revision.

## 3. Implement the slice

Invoke `spec-implement` for the slice (or follow `layer-checklist.md` directly
for pure chore/test/infra slices): dependency order, `pnpm verify` after each
layer, generated-artifact regen when verify flags staleness. Scope discipline:
implement exactly this slice's criteria; growth past it is an explicit
decision, not an absorption.

## 4. Certify against the checks block

For each of the slice's criteria, run its validation command from the checks
block. All must be green **and** the enforced milestone check green:

```bash
pnpm verify
```

A criterion without a green command is not certified — fix the work or stop.

## 5. Gate and land the PR

Invoke the `validation-gate` skill: rebase, fresh-context `pr-review`, verify,
docs pass, risk score, evidence, PR. Carry **every** tamper-audit flag from the
current iteration into the PR description with a one-line justification each —
an unexplained flag treated as hidden is an escalation.

Merge per the policy in force on the goal doc:

- **Human merge (default until ADR-0018 activates):** push, shepherd CI
  (`pr-shepherd`), report, and wait for the human. While waiting, do not start
  a dependent slice — start an independent one if any exists.
- **ADR-0018 active:** L → merge after green CI + clean review; M → merge +
  next-day digest entry; H/C → same as human-merge path.

## 6. Log and advance

On merge, append to the goal doc's verification log:

`| date | Sn | PR url | commands run + results | tamper flags (or none) | pr-respond rounds | notes |`

Then check off the slice's Done-when boxes and the spec's tagged AC boxes
(only when covered by a test on `main`), update spec/Milestone status, and
proceed to §1 for the next slice.

## Stopping: escalation classes

Stop and emit `[[GOAL_BLOCKED]]` (with `DECISION NEEDED:` + 2–3 options) when
the goal doc's escalation classes trigger. Additionally, without exception:

- A test assertion must be modified/deleted/narrowed to make progress
- A criterion's validation command is wrong or weak in practice (doc is pinned;
  say what to change and why)
- The enforced check is red for 3+ consecutive rounds with no fixable cause
- Two slices turn out to be one (scope split was wrong) — propose the split,
  don't absorb it

## Goal completion

When the last slice lands: run the full checks block one final time, confirm
every Done-when box is `[x]` with tests, set the goal doc `status: complete`,
close the Milestone, and report the evidence summary. Under `/goal`, this
report precedes `[[GOAL_COMPLETE]]` — the plugin re-runs the milestone check
and rejects the marker if it is red.
