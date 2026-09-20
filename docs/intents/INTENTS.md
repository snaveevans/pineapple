> **Audience:** product owners and AI agents · **Purpose:** authoritative map of accepted product intent · **Source of truth:** this file · **Last reviewed:** 2026-09-19

# Intent Index

Intent Briefs preserve the durable reason a capability exists and the outcomes,
invariants, and constraints that must survive changes in architecture or code.
They are the highest product authority in Pineapple's delivery workflow.

Specifications remain under [`docs/specs/`](../specs/) as the agent-owned,
detailed interpretation of intent. ADRs record significant architecture
decisions, executable contracts define their own surfaces, tests provide
evidence, and pull requests report whether the implemented result satisfies the
intent. See [ADR-0019](../decisions/0019-use-intent-driven-development.md).

## Authority

When artifacts disagree, resolve them in this order:

1. Accepted Intent Brief
2. Accepted ADRs and architecture approved at the ready gate
3. Feature and cross-cutting specifications
4. Executable contracts, including OpenAPI for HTTP wire shapes
5. Tests and implementation

Do not silently edit intent to accommodate implementation. Reopen the ready
gate when a lower layer cannot satisfy accepted intent.

## Lifecycle

| Status       | Meaning                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `draft`      | The problem, outcomes, or boundaries are still being discussed.                                |
| `accepted`   | Intent, architecture direction, and evidence expectations passed the ready gate.               |
| `superseded` | A newer Intent Brief replaces this one; retain the historical record and link both directions. |
| `retired`    | The intent no longer applies and has no replacement.                                           |

Implementation progress does not change intent status. Specs, issues, goals,
and pull requests track delivery.

## Length

| Scope                        |                                               Target |
| ---------------------------- | ---------------------------------------------------: |
| Small behavioral change      |                                        150–300 words |
| Normal feature               |                                        300–800 words |
| Significant subsystem change |                                      500–1,000 words |
| Larger than 1,000 words      | Split into a parent intent and focused child intents |

The durability test is simple: if the implementation were replaced tomorrow,
most of the brief should remain true.

## Feature Intents

No feature intents have been added yet. Create the first brief for the next
behavior-changing request; do not backfill existing specifications solely to
populate this table.

| Intent | Area | Status | Related specs |
| ------ | ---- | ------ | ------------- |

## Workflow

1. Use the template in `templates/feature-intent.template.md` for a new
   capability or deliberate behavior change.
2. Resolve material open questions and agree on architecture direction,
   conceptual evidence expectations, scope, non-goals, and high-level delivery
   boundaries. Do not put the detailed spec, acceptance criteria, delivery
   slices, or named tests into the approval packet.
3. After explicit human approval, set the brief to `accepted` and record the
   date, approver, durable approval reference, approved architecture direction,
   high-level delivery boundaries, and remaining uncertainty.
4. Let the agent derive the detailed specification, delivery plan, and named
   evidence; then own test-driven implementation, verification, and PR
   preparation without routine confirmation pauses.
5. At the PR, require the human to verify the reported evidence and explicitly
   approve merge for agent-authored and product changes. Eligible Dependabot
   updates retain their dedicated auto-merge exception.

An issue-backed bug fix never requires a new or edited Intent Brief, including
when the bug reveals a specification miss. Treat the issue as the corrective
request, revise the relevant spec, and begin with a failing regression test. If
the work is actually a deliberate product behavior change, reclassify it and use
the intent workflow. Pure refactors and chores with no behavioral change also do
not require a brief.
