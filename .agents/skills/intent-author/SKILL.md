---
name: intent-author
description: Turn a new capability or deliberate behavior change into an accepted Intent Brief and one human-approved ready packet covering architecture direction, evidence expectations, scope, high-level delivery boundaries, and uncertainty. Do not use for issue-backed bugs or behavior-preserving work.
---

# Intent author

Intent is Pineapple's human-facing outer contract. This skill performs the one
collaborative design gate before agents autonomously specify, test, implement,
validate, and open a PR.

## Classify first

Inspect the request, repository, existing intents, specs, ADRs, and relevant
code. Classify the work:

| Work                                                     | Intent handling                                               |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| New capability or materially changed observable behavior | Create or revise an Intent Brief and run the ready gate       |
| Issue-backed bug, including a specification miss         | No intent work; return to `issue-implement`'s corrective path |
| Behavior-preserving refactor, docs, or chore             | No new intent or spec                                         |

When classification is uncertain, explain the competing readings and ask only
the product question that distinguishes them.

## 1. Frame durable intent

Use `docs/intents/templates/feature-intent.template.md`. Keep the brief at
outcome altitude:

- Small change: 150–300 words
- Normal feature: 300–800 words
- Subsystem change: 500–1,000 words
- Over 1,000 words: split parent/child intents

Give every desired outcome and invariant a stable `OUT-*` or `INV-*` ID. Record
the problem, affected users/systems, genuine constraints, non-goals, conceptual
evidence expectations, and material open questions. Do not duplicate endpoint
schemas, field tables, test names, filenames, or implementation mechanics.

An intent remains `draft` while any material open question is unresolved. A
question may instead be explicitly excluded in Non-Goals.

## 2. Propose architecture

Inspect the current layers and conventions before proposing a direction. State:

- components/layers affected and their responsibilities;
- data, contract, auth, queue, or deployment boundaries involved;
- compatibility and rollout constraints;
- decisions that need ADRs.

Use `adr-author` only for significant or hard-to-reverse choices with real
alternatives. Routine feature architecture belongs in the linked spec. Intent
owns why/outcomes; ADRs own architectural choices; specs own detailed behavior
and routine mechanism; OpenAPI owns HTTP wire shapes.

Do not ask the human to choose file layout, helper names, test doubles, or other
implementation mechanics.

## 3. Shape evidence and delivery boundaries

For every `OUT-*`/`INV-*`, state what kind of evidence would be convincing and
whether a critical vertical journey is required. Choose from unit/domain,
component/application, integration, contract, browser E2E, smoke, and mutation
layers. This is the conceptual evidence standard, not a named test plan.

Define scope, non-goals, dependencies, and high-level delivery boundaries well
enough to expose sequencing and unsafe scope growth. Do not derive detailed
acceptance criteria, the spec Delivery Plan, slice tags, filenames, or test
names before approval; those are agent-owned downstream artifacts.

## 4. Present the ready packet

Present one compact packet:

1. Intent Brief (still `draft`)
2. Proposed architecture and ADR decisions
3. Conceptual evidence expectations by `OUT-*`/`INV-*`
4. Scope, high-level delivery boundaries, dependencies, and non-goals
5. Remaining uncertainty, or `none`

Ask for one explicit approval of this packet. This is the ready gate. Do not
start implementation or imply acceptance before approval.

## 5. Record approval

After explicit human approval, record the packet as one atomic gate transition:

- accept every proposed ADR that was included in the approved architecture
  packet and update the ADR index; an unapproved/proposed material ADR blocks
  execution;
- set the Intent Brief to `accepted`; record the ready-gate date, human
  approver, durable approval reference, approved architecture direction,
  high-level delivery boundaries, and remaining uncertainty; then update
  `docs/intents/INTENTS.md`;
- invoke `spec-author` to derive/revise the detailed behavior, delivery slices,
  intent-tagged criteria, and named evidence plan from the accepted packet;
- record the ready-gate date in that spec and set an otherwise complete unbuilt
  spec to `review` without another approval pause;
- leave implementation progress to specs, issues, code, and PRs—intent has no
  `implemented` status;
- hand off to `intent-executor`.

If approval changes the packet, revise it and ask for approval of the material
delta. Editorial corrections do not require a new gate.

## Hard stop

If intent, architecture, or evidence cannot be reconciled, keep the brief
`draft` and report the exact unresolved choice. Never weaken or silently rewrite
intent to fit an implementation preference.
