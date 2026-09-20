---
name: spec-author
description: Derive or revise an agent-owned feature specification after the intent ready gate, or update a specification for an issue-backed bug without intent work. Retains Greenfield, Brownfield, Revise, and Bug modes and owns detailed behavior, slices, and named evidence.
---

# Spec author

Specifications are Pineapple's durable, detailed interpretation layer. For
features they sit beneath accepted intent; for bugs they record the correction
authorized by the issue. The agent owns specification mechanics. Humans decide
feature intent, material architecture, and the evidence standard at the ready
gate—not filenames, helper shapes, detailed criteria, slices, or test names.

## Inputs and authority

Before editing, read the applicable authority:

1. for a feature/change, the accepted Intent Brief and approved ready packet;
2. for a bug, the GitHub issue (no Intent Brief or ready gate required);
3. approved architecture and related ADRs, when applicable;
4. relevant feature and cross-cutting specs;
5. `docs/specs/templates/feature-spec.template.md`;
6. relevant code for Brownfield, Revise, and Bug modes.

OpenAPI remains authoritative for HTTP wire shapes; link it rather than copying
schema tables. If feature detail cannot satisfy accepted intent or approved
architecture/evidence, stop and return to `intent-author`'s ready gate. If a bug
cannot be specified without choosing new product behavior, reclassify it as a
deliberate behavior change; never edit intent to fit the defect.

Behavior-preserving refactors and chores need no new spec. Untouched legacy
specs do not require backfill.

## Choose a mode

Infer and state one:

- **Greenfield** — capability or spec does not exist; accepted intent exists.
- **Brownfield** — document existing code beneath accepted intent.
- **Revise** — sharpen an existing spec or interpret accepted intent.
- **Bug** — revise or create the relevant spec from an issue reporting
  unintended behavior; no intent work.

Ask only when the product meaning is genuinely ambiguous. Do not pause for
naming, file placement, slice mechanics, test-layer choices, or other decisions
that follow from repository conventions.

## Shared method

### 1. Establish scope

For a feature/change, identify affected personas/system actors and scenarios:
happy path, meaningful errors/edges, lifecycle transitions, and non-goals.
Derive user stories in the form “As a **[persona]**, I can **[action]** so that
**[outcome]**.”

For a bug, identify only the affected behavior and expected correction stated by
the issue. Treat current code as evidence of the defect, not authority.

Read and apply `cross-cutting-checklist.md`. Resolve mechanics from established
patterns. Escalate only a question whose answer changes observable behavior,
accepted architecture/evidence, or authority boundaries.

### 2. Record authority and architecture

For a feature/change, add:

- `Related Intent` link and approved ready-gate status;
- a detailed Architecture section derived from the approved direction;
- related ADR links for significant choices.

For a bug, record `Related Intent: Not required`, link the corrective issue in
`Related Issues`, and use `Ready Gate: not required — bug #N`. Record only
architecture needed to explain the correction. Do not create or edit an Intent
Brief.

Routine feature architecture stays in the spec. Do not promote every technical
choice to an ADR.

### 3. Slice delivery

Partition feature work into independently reviewable, shippable slices within
the repository scope budget. New mechanisms and the feature using them are
separate slices/branches. Fill `Delivery Plan` and tag every affected acceptance
criterion with exactly one `S#`.

For feature behavior, also tag each affected criterion with every applicable
`OUT-*`/`INV-*`, for example:

```markdown
- [ ] `S2` `OUT-1` `INV-2` The owner can …
```

For a bug already covered by a criterion, keep its slice, checkbox, and
lifecycle unchanged and link the issue/evidence. When the bug exposes a spec
miss, add or correct only the affected criterion or edge-case row and associate
it with the owning slice; no intent tag or unrelated legacy backfill is needed.

### 4. Build the layered evidence plan

Map every affected feature intent ID or bug issue to a claim, the smallest
sufficient evidence layer, and a named proof. Available layers are unit/domain,
component/application, integration, contract, browser E2E, smoke, and mutation.
Use one critical vertical browser proof where the approved feature packet or bug
risk requires it; avoid duplicating every scenario at every layer.

### 5. Write the spec

Write or update `docs/specs/features/<name>.md` and its row in
`docs/specs/SPECS.md`. The spec owns detailed observable behavior, error states,
telemetry, delivery slices, and acceptance state. Proceed without another human
approval once the governing authority is clear.

## Mode details

### Greenfield

- Select a concise kebab-case capability name from accepted intent and
  repository conventions.
- After the ready gate, derive the full spec, delivery plan, and named evidence
  from the accepted intent, architecture direction, and evidence expectations.
- Set `Status: review` when complete and no blocking open question remains.

### Brownfield

- Locate routes, use cases, UI, events, and current tests.
- Describe current inputs → validation → behavior → outputs → side effects.
- Treat code as evidence, not authority over accepted intent.
- Mark a conflict `REVIEW NEEDED`; never silently choose code over intent.
- Add intent links/tags only for affected behavior.

### Revise

- Catalogue `NOT SPECIFIED`, `REVIEW NEEDED`, `AMBIGUOUS`, and missing sections.
- Resolve items derivable from accepted intent, ADRs, or established contracts.
- Escalate genuine product ambiguity; move explicit exclusions to Out of Scope.
- Preserve the current lifecycle: `review` before the first slice,
  `in-progress` after one ships, `active` only when no unchecked criteria remain.

### Bug

- Read the issue, spec, code, and existing tests.
- Record the expected correction and issue link even when the existing criterion
  already describes the behavior.
- Add a named regression proof and update only the affected criteria/edge rows.
- Preserve an `active` lifecycle for an already-covered regression. A missing
  criterion may be added unchecked and completed in the same corrective PR.
- Never create or edit an Intent Brief for the bug.

## Quality gate

Before saving, verify:

- a feature/change links accepted intent and an approved ready gate;
- a bug links its issue, states corrected behavior, and has no fabricated intent;
- every story maps to an atomic, independently testable criterion;
- every feature criterion has one slice tag and applicable intent tags;
- every bug correction targets the affected criterion/edge and needs no intent tag;
- a legacy bug correction needs no Delivery Plan or synthetic slice tag, and
  leaves unrelated criteria untouched;
- every affected intent ID or bug issue has a named evidence row;
- cross-cutting concerns and telemetry are addressed or explicitly excluded;
- material ADRs are linked and routine architecture is summarized;
- web behavior is reflected in `docs/web/FEATURES.md` when applicable;
- unresolved items are explicit questions, never silent gaps.
