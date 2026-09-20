---
name: spec-implement
description: Implement one feature-spec slice or issue-backed bug correction with test-first development. Enforces accepted intent for features and deliberate behavior changes, while bugs require only their issue, updated spec, and regression proof. Proceeds without routine confirmation pauses.
---

# Spec implement

This is the detailed SDD/TDD implementation layer beneath `intent-executor` or
the bug path in `issue-implement`. It does not negotiate product intent or
re-run the ready gate.

## Resolve target and mode

Inspect git state, recent spec changes, and Delivery Plans:

```bash
git status --porcelain -- 'docs/specs/**/*.md' 'docs/intents/**/*.md'
git diff --name-only origin/main...HEAD -- 'docs/specs/**/*.md' 'docs/intents/**/*.md'
git log --oneline -10 --name-only -- 'docs/specs/**/*.md'
```

Infer:

- **New** — no implementing code exists for the selected feature spec/slice.
- **Diff** — an existing feature spec changed; implement only its delta.
- **Bug** — the linked issue reports unintended behavior; implement the
  correction recorded by `spec-author`.

Choose the next `Sn` with unchecked criteria and satisfied dependencies for
feature work. For a bug against an `active` or legacy spec, target the affected
criterion or edge case named by the issue without creating a Delivery Plan or
synthetic slice. State the target in one line and proceed. Ask only when
multiple candidates are genuinely equally likely or product meaning is
ambiguous.

## Pre-flight

Read the authority for the work type, the target spec, related cross-cutting
specs, ADRs, and evidence plan.

For a feature or deliberate behavior change require:

1. linked Intent Brief is `accepted`;
2. Ready Gate is approved;
3. spec is `review` or `in-progress`;
4. target criteria have one slice tag and applicable `OUT-*`/`INV-*`;
5. each affected intent ID has a named evidence method;
6. no blocking open question remains;
7. API work has telemetry and contract treatment.

For an issue-backed bug require:

1. a linked GitHub bug issue—the issue is sufficient corrective authority;
2. the relevant spec states the expected corrected behavior and names the
   regression proof;
3. no new or edited Intent Brief and no ready gate;
4. an `active` or legacy spec is allowed, and missing legacy intent metadata is
   not a blocker;
5. API work still has applicable telemetry and contract treatment.

A behavior-preserving refactor may proceed without intent/spec creation when
characterization coverage protects it. If a supposed bug actually chooses new
product behavior, route it through `intent-author`. If a lower feature layer
conflicts with accepted intent, architecture, or evidence expectations, reopen
the ready gate; never edit intent to fit the code.

## Test-first implementation

Use the implementation-blind `test-author` plan produced in a fresh isolated
context. For bugs, the plan maps proof to the issue and affected spec criterion
rather than inventing an intent ID. If no plan exists for changed observable
behavior, return to the orchestrator to commission it before inspecting
implementation details.

1. Add the smallest acceptance, regression, or characterization test proving
   the intended behavior.
2. Run it and observe failure for the missing behavior.
3. Implement the minimum change.
4. Refactor while tests remain green.
5. Never narrow/delete/skip the blind assertion to obtain green.

TDD exceptions are docs-only work, mechanical refactors already protected by
characterization tests, and deployment-only checks. Record the exception in PR
evidence.

## New mode

Implement only the selected slice through the layers it needs, respecting the
dependency direction in `CLAUDE.md`:

1. domain
2. application
3. infrastructure
4. API schemas/route specification
5. `worker.ts` composition
6. frontend

Use `layer-checklist.md`. After a coherent layer/change loop, run the narrow
tests plus lint/type-check; do not accumulate structural errors. Skip layers the
slice does not need and record why.

## Diff and Bug modes

Diff the target spec against `origin/main` and translate only its changed
criteria, edge cases, architecture, telemetry, and evidence rows into code
impact. For an already-specified bug with no semantic spec delta, use the issue, affected
criterion, and named regression proof. Locate existing implementation, then
implement only that delta without unrelated refactoring. A newly discovered
separate concern becomes a follow-up branch.

## Contracts and evidence

- OpenAPI remains authoritative for wire shapes; edit Zod route specs, then run
  `openapi:generate` and web `api:types`.
- Regenerate Worker binding types after `wrangler.jsonc` binding changes.
- Run every named proof for affected `OUT-*`/`INV-*` or the bug issue.
- Run `pnpm test:e2e` when the evidence plan marks a critical browser journey or
  the branch falls within its CI scope.
- Run `pnpm verify` after all changes.

Then invoke `test-review`. Missing mapped authority, missing critical vertical
proof, weakened blind tests, or checked boxes without pinning tests block
completion.

## Completion

- One feature slice per PR; implement and check off only criteria tagged with
  that `Sn`.
- An already-specified bug leaves its existing checkbox and `active` lifecycle unchanged.
  A spec-miss criterion added for the bug is checked only after the correction
  is implemented and pinned by the regression test.
- First shipped feature slice moves `review` → `in-progress`; the final box moves
  the spec to `active`.
- Update `docs/web/FEATURES.md` for meaningful web flow/screen changes.
- Report any TDD exception and remaining uncertainty in the PR evidence.

Commit and PR mechanics belong to `validation-gate` / `pr-shepherd`. Hand the
finished PR to the human with claim-by-claim evidence; the human verifies that
evidence before explicitly approving merge.
