---
name: spec-implement
description: Implement a feature from its spec(s). Detects the target spec from recent spec changes, builds a complete spec across all layers, or implements only what changed in an updated spec.
---

## Find the target spec

Do NOT expect a command argument. Work out which spec to implement from git state:

```!
echo "── Uncommitted spec changes ──"
git status --porcelain -- 'apps/*/specs/**/*.md'
echo "── Spec files changed vs main ──"
git diff --name-only main -- 'apps/*/specs/**/*.md' 2>/dev/null
echo "── Recently committed specs ──"
git log --oneline -10 --name-only -- 'apps/*/specs/**/*.md' 2>/dev/null
```

Use the output to pick the target and the mode:

- A **new, untracked** spec file (or a spec with no implementing code yet) → **New** (full build across all layers).
- An **existing** spec with uncommitted edits or recent commits that changed it → **Diff** (implement only the delta).

Propose the spec file(s) and the mode you inferred in one line and confirm with the user. If nothing relevant shows up, or several candidates are equally likely, ask the user which feature to implement. A full-stack feature may have a spec in each package — implement the API spec's layers and the web spec's layers together.

---

## Pre-flight (both modes)

Specs are organized by package (see `docs/specs/SPECS.md`). A feature may have an
API capability spec (`apps/api/specs/features/[name].md`), a web UX spec
(`apps/web/specs/features/[name].md`), or both. Read **every** spec that exists for
the feature — the API spec drives the backend layers, the web spec drives the
frontend. Then verify each:

1. **Status is not `wip`** — WIP specs are not ready to implement. Stop and tell the user to run `/spec-author` first to complete the spec.
2. **No blocking `NOT SPECIFIED` flags** — any flag whose resolution would change what code to write is a blocker. Surface them and ask the user to resolve before continuing.
3. **Telemetry section exists (API spec)** — if the feature has an API capability spec and its Telemetry section is missing, the operation name and domain event contract are unknown. Stop and flag it. (Pure web specs have no telemetry.)
4. **Acceptance criteria exist** — if the AC section is empty or has only placeholders, the spec is not implementable. Stop.

If pre-flight passes, summarize what will be built and confirm with the user before proceeding.

---

## New

Implement the full spec across every layer it touches. Follow the dependency order — each layer may only import inward per the architecture in `CLAUDE.md`.

Work through [layer-checklist.md](layer-checklist.md) for each layer the spec requires. Not every feature touches every layer — skip layers that are not needed and state why.

**Order:**

1. Domain
2. Application
3. Infrastructure
4. API (schemas + route spec)
5. `worker.ts` (wire deps + register route)
6. Frontend (if applicable)

**After each layer:** run `pnpm lint && pnpm type-check` before moving to the next. Fix any errors before proceeding — do not accumulate lint or type errors across layers.

**After all layers:**

- Run `pnpm -r test` and fix any failures
- If any API route was added or changed: run `pnpm --filter @snaveevans/pineapple-api openapi:generate` and commit the updated `docs/reference/openapi.json`
- Run the full check one final time: `pnpm lint && pnpm type-check && pnpm -r test`

---

## Diff

Implement only the delta between the spec's last committed state and its current state.

**1. Get the spec diff**

Run a diff against the spec file(s) you identified in **Find the target spec** (substitute the detected path; a full-stack feature has one per package, so run it for each):

```
git diff main -- "<detected-spec-path>" 2>/dev/null || git diff HEAD~1 -- "<detected-spec-path>" 2>/dev/null || echo "No diff found — spec may not have changed since main"
```

A full-stack feature may show a diff in both the API and web specs. Interpret each.

If no diff is found, ask the user to confirm which version of the spec changed and how.

**2. Interpret the diff** — Translate each change in the spec to a code impact:

- New acceptance criteria → new code path or validation rule
- Removed acceptance criteria → code to delete or simplify
- Changed edge case behavior → logic update
- New flag resolved → implement the decided behavior
- Telemetry section added or changed → new operation mapping or domain event handler

Present the interpreted impact list to the user and confirm before writing any code.

**3. Locate existing code** — Find the files already implementing this feature across all layers. Read them to understand current state before making changes.

**4. Implement the delta** — Make only the changes the diff requires. Do not refactor unrelated code. If a change would require touching something outside the spec delta, flag it and ask.

**5. After all changes:** run `pnpm lint && pnpm type-check && pnpm -r test`. If any API route changed, regenerate the spec: `pnpm --filter @snaveevans/pineapple-api openapi:generate`.

---

## Completion

When implementation is done:

- Confirm all acceptance criteria in the spec are satisfied — walk through them one by one
- Note any criteria that could not be met and why (flag candidates for the spec)
- Remind the user to run `/spec-author` (document existing code) if behavior diverged from the spec during implementation
