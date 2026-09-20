---
name: intent-executor
description: Execute one slice from an accepted Intent Brief and approved ready packet through blind test planning, TDD, implementation, test review, validation, and PR creation without routine approval pauses. Stops for material intent/architecture/evidence conflict, escalation rules, or unsafe scope growth.
---

# Intent executor

This skill begins only after the human has approved intent, architecture
direction, and evidence expectations once and the agent has derived the detailed
spec. It owns the autonomous path from accepted packet to a reviewable PR. The
human's next checkpoint is verifying PR evidence and deciding whether to merge.

## 0. Prove readiness

Resolve the target Intent Brief and linked spec. Read the intent, spec, related
cross-cutting specs, accepted ADRs, and the approved evidence plan. Require:

- intent status `accepted`;
- spec status `review` or `in-progress`;
- an approved ready gate;
- no material open question affecting the next slice;
- each affected criterion tagged with one slice and applicable `OUT-*`/`INV-*`.

Issue-backed bugs use `issue-implement`'s corrective path and do not need this
skill or an Intent Brief. Behavior-preserving refactors do not need this skill.

If readiness is missing for new behavior, stop and route to `intent-author`.

## 1. Select one slice

Choose the next unimplemented slice whose dependencies are complete. State the
slice, affected intent IDs, scope, and evidence layers. Continue
without asking for file-level or implementation confirmation. One slice equals
one PR.

Ensure the slice has a GitHub issue before test planning. If the Delivery Plan
has no issue, create one autonomously from the approved slice scope, link the
accepted intent and spec, and write the issue number back to the spec. This is
execution bookkeeping, not another design gate.

## 2. Plan tests blind

Invoke `test-author` in a fresh, isolated agent/task before reading or changing
implementation for the slice. Pass only the issue, intent, ready packet, spec,
cross-cutting spec, and ADR references—never implementation observations or
code excerpts. A caller that inspected brownfield code must not author the plan
in its own context. The fresh plan must map every required proof to an
`OUT-*` or `INV-*`, select the lowest useful layer, and name a vertical browser
journey when the ready packet marks a flow critical.

For observable behavior, add an acceptance, regression, or characterization
test that fails for the missing behavior before production changes. Record a
TDD exception only for docs-only work, a mechanical refactor already protected
by characterization tests, or proof that can exist only after deployment.

## 3. Implement test-first

Invoke `spec-implement` for the selected slice:

1. Observe the required test fail for the intended reason.
2. Implement the minimum behavior.
3. Refactor while tests remain green.
4. Regenerate executable contracts when their sources change.
5. Run the slice's planned evidence and `pnpm verify`.
6. Run `pnpm test:e2e` when the evidence plan or CI scope requires it.

Do not narrow, delete, skip, or rewrite blind assertions merely to make the
implementation green.

## 4. Review evidence

Invoke `test-review`. A slice is blocked when:

- a critical intent claim has no mapped proof;
- a planned vertical proof is missing;
- a blind test was weakened;
- a checked spec criterion is not pinned;
- tests contradict intent, architecture, or spec.

Fix valid gaps and rerun review. `test-review` identifies gaps; the executor
performs the repair.

## 5. Validate and open the PR

Invoke `validation-gate`, then `pr-shepherd` for CI. The PR evidence must report
each affected intent ID, its claim, named proof, result, and remaining
uncertainty. Keep OpenAPI as the authority for wire shapes and update only this
slice's spec checkboxes/status.

Commit, push, and open the PR autonomously. Never merge; report the green PR's
claim-by-claim evidence and remaining uncertainty so the human can verify it and
explicitly approve merge.

## Stop conditions

Stop and reopen the ready gate only when:

- satisfying the work would materially change accepted intent;
- architecture or evidence must change beyond the approved packet;
- scope growth crosses into another concern or makes the slice unsafe;
- an existing skill's escalation rule triggers.

Routine implementation choices, filenames, and test mechanics are agent-owned
and are not reasons to pause.
