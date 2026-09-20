---
name: goal-executor
description: Execute an approved goal slice by slice. Feature/change slices require accepted intent plus a spec; bug slices require their issue plus an updated spec. Each runs blind authority-mapped tests, TDD, test review, validation, PR, and evidence logging.
---

The per-slice pipeline a goal loop runs. The `/goal` plugin owns the loop
discipline (re-prompting, the pinned check, tamper audit); **this skill owns
what one iteration of real work looks like**. The goal doc is the destination;
deterministic gates are the only evidence.

**Input:** a goal doc path (e.g. `docs/goals/2026-09-<name>.md`), or detect the
single doc under `docs/goals/` with unchecked criteria. If `status` is not
`review`/`active`, stop — `goal-author` hasn't finished.

## 0. Orient

Read the goal doc end to end. For every feature/change slice read its accepted
Intent Brief and approved ready/evidence packet; for every bug slice read its
corrective issue. For both, read the spec and ADRs. Restate in one block: goal, slices with status
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

A feature/change slice without accepted intent and an implementation-ready spec
is blocked; route it to `intent-author`. A bug slice without its issue and
corrective spec update is blocked; route it through `issue-implement` Bug mode.
Pure refactor/chore/infra slices record why they have no behavior artifacts.

## 2. Blind acceptance tests — mandatory, first

Invoke the `test-author` skill **before** any implementation exists in context:
produce the failing tests from the applicable authority + goal + spec alone.
Feature proof maps to `OUT-*`/`INV-*`; bug proof maps to the issue and affected
criterion. Use the smallest useful layer and include a required critical
vertical journey when applicable.

- The implementer (you, next step) may **add** tests but must never modify,
  delete, or narrow these assertions regardless of outcome — the tamper audit
  surfaces violations and this skill treats hiding one as an escalation.
- If `test-author` finds a criterion untestable as written, that is a **stop**:
  the criterion is defective (can't name a live-verified command and a test).
  Emit `[[GOAL_BLOCKED]]` under `/goal` — the doc is pinned; it needs a human
  revision.

## 3. Implement the slice

Continue through `intent-executor` for a feature/change slice, or the
`issue-implement` bug execution path for a bug, reusing the blind plan from §2
rather than authoring a second one. Both delegate to `spec-implement` and
complete `test-review`. Follow `layer-checklist.md` directly for pure
chore/test/infra slices: dependency order, `pnpm verify` after each
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
docs pass, risk score, authority-mapped evidence, PR. Carry **every** tamper-audit flag from the
current iteration into the PR description with a one-line justification each —
an unexplained flag treated as hidden is an escalation.

Push, shepherd CI (`pr-shepherd`), report the evidence, and wait for the human
to verify it and explicitly merge.
While waiting, do not start a dependent slice; an independent slice may proceed.

## 6. Log and advance

On merge, append to the goal doc's verification log:

`| date | Sn | PR url | authority + named proof/results | tamper flags (or none) | pr-respond rounds | uncertainty |`

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
