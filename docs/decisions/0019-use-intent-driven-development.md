# Use intent-driven development as the outer delivery loop

- Status: accepted
- Date: 2026-09-19

## Context and Problem Statement

Pineapple's specification-driven workflow preserves detailed behavior well, but
the specification has become the primary human control surface. Feature specs
also carry delivery state, edge cases, and testable interpretations, so they can
grow much larger and change more often than the underlying reason a capability
exists.

AI agents can now own more of that detailed translation and implementation, but
future agents still need durable records that distinguish the intended outcome
from the particular specification, architecture, tests, and code chosen at one
point in time. Removing specifications would lose that handoff value; keeping
the current workflow unchanged would continue to spend human attention below
the level where product judgment matters most.

## Decision Drivers

- Preserve the durable problem, outcomes, invariants, and constraints separately
  from a changing implementation interpretation.
- Keep detailed specifications and executable evidence available to cold agents.
- Concentrate human approval on intent, architecture, and the standard of proof.
- Allow agents to own detailed specification, test-driven implementation, and
  verification after one explicit ready gate.
- Retain the human merge boundary for agent-authored and product changes while
  preserving the existing Dependabot auto-merge exception, plus the
  one-home-per-fact documentation method from
  [ADR-0008](0008-documentation-method.md).

For agent-authored and product changes, the human merge boundary supersedes the
now-stale “CI is the only gate” premise recorded in the historical context of
[ADR-0016](0016-mutation-testing-as-the-ci-trust-boundary.md) and
[ADR-0017](0017-expand-contract-schema-migrations.md). Their actual decisions
remain in force: mutation and schema-safety checks are still blocking evidence.
Eligible Dependabot updates remain the narrow exception and may auto-merge
under their existing workflow after required checks pass. Any broader future
autonomous-merge policy must explicitly supersede this decision.

## Considered Options

- Keep specification-driven development as the outer workflow.
- Replace specifications with short intent briefs.
- Put intent above agent-owned specifications, tests, and implementation.

## Decision Outcome

Chosen option: **put intent above agent-owned specifications, tests, and
implementation**, because it preserves detailed, transferable engineering
knowledge while moving the human interface to durable outcomes and judgment.

An accepted Intent Brief is the highest product authority. Intent, architecture
direction, evidence expectations, scope, non-goals, high-level delivery
boundaries, and material uncertainty are agreed with the human in one ready
gate. The detailed specification, acceptance criteria, delivery slices, and
named test plan are deliberately not part of that approval surface. After the
gate, an agent derives or revises those artifacts, uses specification-driven and
test-driven development, implements, verifies, and opens a pull request without
intermediate implementation approvals. At the final checkpoint, the human
verifies the reported evidence and explicitly approves merge for agent-authored
and product changes. Dependabot updates that satisfy the repository's dedicated
auto-merge workflow remain exempt.

Accepted architecture decisions outrank specifications. Specifications remain
the authoritative detailed behavioral interpretation and retain their existing
lifecycle, slices, and acceptance checkboxes. Executable contracts remain
authoritative for their own surfaces; in particular, OpenAPI remains the source
of truth for HTTP wire shapes. When a lower layer conflicts with accepted
intent, the agent reopens the ready gate instead of silently changing intent.

Issue-backed bugs are a separate corrective path. Unintended behavior does not
need a new or edited Intent Brief, including when it exposes a case omitted from
the original specification. The issue is sufficient authority for the fix; the
agent revises the relevant specification, begins with a failing regression test,
and reports evidence against the issue and affected criteria. A request that
turns out to choose new product behavior is reclassified as a behavior change
and returns to the intent ready gate.

### Positive Consequences

- Human attention stays on why the work exists, what must become true, important
  architectural choices, what evidence would be convincing, and whether the
  final evidence actually supports the claims.
- Existing specifications remain useful and require no bulk migration.
- A cold agent can trace intent through specification, tests, implementation,
  and pull-request evidence.
- Detailed SDD and TDD work can evolve without turning the intent brief into a
  second specification.

### Negative Consequences

- Features may now have both an intent brief and a specification, so links and
  authority must remain explicit to avoid duplication.
- Agents must maintain traceability from intent outcomes and invariants into
  acceptance criteria and evidence.
- The ready gate adds deliberate up-front discussion before autonomous
  implementation begins.
- Merge policy has a deliberate actor-specific exception, so documentation and
  automation must not imply that every pull request follows one universal rule.

---

## Pros and Cons of the Options

### Keep specification-driven development as the outer workflow

- ✅ Good, because the current workflow and artifacts already exist.
- ✅ Good, because detailed behavior remains explicit.
- ❌ Bad, because humans continue to manage detailed interpretations and
  delivery mechanics rather than durable outcomes.
- ❌ Bad, because the reason a feature exists remains mixed with mutable
  behavioral detail.

### Replace specifications with short intent briefs

- ✅ Good, because the durable human-facing artifact stays small.
- ❌ Bad, because intent alone does not preserve the exact interpretation an
  earlier agent implemented.
- ❌ Bad, because tests and code become harder to evaluate when behavior is
  not expressed independently of them.

### Put intent above agent-owned specifications, tests, and implementation

- ✅ Good, because intent and implementation interpretation remain separately
  durable and traceable.
- ✅ Good, because SDD and TDD remain available as agent techniques.
- ❌ Bad, because the workflow has more artifact types and needs disciplined
  linking to prevent duplicated facts.
