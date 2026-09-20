---
name: issue-implement
description: Take a GitHub issue through Pineapple's delivery flow to a green pull request. Routes new capabilities and deliberate behavior changes through intent-author, treats a bug issue as sufficient corrective authority for a spec update, and skips intent/spec creation for behavior-preserving work. Never merges.
---

# Issue implement

Orchestrate; do not duplicate the specialist skills. The normal feature path is
issue → `intent-author` planning and ready gate → agent-owned spec →
`intent-executor` → PR → human evidence verification and merge.

## 0. Read and classify

Fetch the explicit issue number/URL from GitHub, summarize its requested
outcome, and inspect linked intents, specs, ADRs, issues, and dependencies.

Classify exactly one:

| Type                                         | Intent/spec route                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| New capability or deliberate behavior change | `intent-author`; approve the ready packet, then derive/revise the spec                       |
| Issue-backed bug, including a spec miss      | No intent work; update the relevant spec and start with a failing regression test            |
| Behavior-preserving refactor/chore/docs      | No new intent or spec; preserve characterization/evidence                                    |
| New architecture/infra mechanism             | Separate concern; use the feature route plus `adr-author` when the choice is hard to reverse |

State the classification, existing coverage, and any required branch split,
then proceed. Ask only if the issue's product meaning is genuinely ambiguous.
If investigation shows that a reported bug actually requests new desired
behavior, reclassify it before implementation.

## 1. Plan architecture and the ready packet

For a feature or deliberate behavior change, invoke `intent-author` before
requiring an accepted intent. This planning phase inspects the repository,
triages architecture, and invokes `adr-author` for any significant or
hard-to-reverse decision with real alternatives. Split a new mechanism (queue,
table, migration pattern) from the feature that consumes it.

The accepted intent and ready gate are implementation prerequisites, not
planning prerequisites. Before asking for approval, present one packet with:

- the draft Intent Brief;
- architecture direction and every proposed ADR decision;
- conceptual evidence expectations by `OUT-*`/`INV-*`;
- scope, non-goals, high-level delivery boundaries, and remaining uncertainty.

Do not include the detailed feature spec, acceptance criteria, delivery slices,
or named test plan. Do not begin implementation until the human explicitly
approves the packet, every included required ADR is accepted, and the Intent
Brief records the approver, date, and approval reference.

After approval, invoke `spec-author` to derive or revise the detailed spec,
delivery plan, and named evidence without another approval pause. Require a
`review`/`in-progress` spec with affected `OUT-*`/`INV-*` mapping before feature
execution. If a required architectural decision is discovered only afterward,
reopen the ready gate; do not author it behind the approved packet.

An issue-backed bug bypasses this gate even when it exposes a specification
gap. Invoke `spec-author` in Bug mode so the issue is linked, the expected
behavior is recorded, and the regression proof is named. Do not create or edit
an Intent Brief and do not backfill legacy intent metadata.

## 2. Choose scope and target

Choose one feature slice whose dependencies are complete. For a bug, target the
affected criterion or edge case named by the issue; a legacy spec needs no
Delivery Plan or synthetic slice. Branch from latest `main` using repository
naming rules; platform-assigned agent branches are exempt. One concern/slice
per PR.

## 3. Execute

For an approved feature/change, invoke `intent-executor`. It performs:

1. implementation-blind `test-author` planning mapped to intent IDs;
2. failing acceptance/characterization test;
3. `spec-implement` TDD across required layers;
4. all named evidence, generated contracts, `pnpm verify`, and required E2E;
5. `test-review` against intent/spec/plan;
6. `validation-gate`, PR creation, and CI shepherding.

For an issue-backed bug, run the same pipeline with the issue and updated spec
as authority: implementation-blind regression planning, an observed failing
test, the minimum correction, test review, validation, and PR evidence. For a
behavior-preserving refactor/chore, follow established layer patterns and invoke
`validation-gate` directly.

If feature implementation wants to change accepted intent, architecture,
evidence expectations, or scope materially, stop and reopen the ready gate. If
a bug fix cannot be resolved without choosing new product behavior, reclassify
it. Routine mechanics do not require human confirmation.

## 4. PR and report

The PR must include:

- issue link (`Closes`/`Fixes` only when fully resolved; otherwise `Refs`);
- accepted Intent Brief and affected `OUT-*`/`INV-*` for a feature/change, or
  the bug issue / behavior-preserving exception;
- target spec/slice or affected bug criteria;
- evidence table: authority, claim, named proof, result, remaining uncertainty;
- risk, test plan, validation-gate result, and escalations.

Commit, push, open the PR, and shepherd CI autonomously. Stop there so the human
can verify the evidence and explicitly approve merge. Eligible Dependabot PRs
remain the separate auto-merge exception.

Report: issue/type, authority handling, spec/ADR handling, slice or bug target,
TDD exception if any, evidence result, PR URL, CI state, and deferred work.
