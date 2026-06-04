---
name: spec-author
description: Draft or update a feature spec. Use /spec-author new for greenfield, /spec-author sync to document existing code, or /spec-author revise to complete a draft spec and make it implementation-ready. Walks through persona brainstorming, scenarios, user stories, and all six cross-cutting concerns.
argument-hint: [new|sync|revise] [feature-name]
disable-model-invocation: true
allowed-tools: Read Bash Write Edit
---

Work conversationally. Ask questions and confirm assumptions before writing. Do not generate a full draft until the steps below are complete.

## Existing specs

!`find docs/specs/features -name "*.md" | sort`

## Mode

Arguments: `$ARGUMENTS`

- `new [name]` → **Greenfield**: spec a feature that does not yet exist in code
- `sync [name|path]` → **Brownfield**: document a spec from existing code
- `revise [name]` → **Revise**: complete a draft spec and make it implementation-ready; the spec drives the code, not the other way around
- No arguments or ambiguous → ask the user which mode and what the feature is

---

## Greenfield

**1. Intent** — Ask for the user problem this feature solves in one sentence. Do not proceed until you have it.

**2. Personas** — Identify all actors. Start with the primary persona (authenticated owner-operator for app features; unauthenticated visitor for public pages) then expand:

- Different states of the primary user (new user with no data, established user, user mid-flow)
- Secondary personas (future team members, delegates)
- System actors (background jobs, webhooks, scheduled tasks)

**3. Scenarios** — For each persona, generate scenarios across three categories:

- **Happy path** — the intended flow from entry to success
- **Error and edge cases** — empty state, validation failure, API error, 401, slow network, concurrent actions
- **Lifecycle transitions** — before/during/after states; navigation on success and failure

**4. User stories** — Derive from scenarios using: "As a **[persona]**, I can **[action]** so that **[outcome]**." Every significant scenario should map to at least one story.

**5. Cross-cutting analysis** — Read and work through [cross-cutting-checklist.md](cross-cutting-checklist.md). Ask the user about unknowns rather than guessing.

**6. Draft** — Read the template at `docs/specs/templates/feature-spec.template.md`, fill it in, and write the spec to `docs/specs/features/[feature-name].md`. Add an entry to `docs/specs/SPECS.md`.

---

## Brownfield

**1. Locate the code** — Find relevant files: route handler in `apps/api/src/api/` or `worker.ts`, use case in `apps/api/src/application/usecases/`, UI component in `apps/web/src/`. Ask if unclear.

**2. Check for an existing spec** — If one exists in `docs/specs/features/`, read it and note any gaps between spec and code.

**3. Describe current behavior** — Summarize what the code actually does: inputs → validation → domain logic → outputs → side effects. Confirm with the user before proceeding.

**4. Cross-cutting analysis** — Read and work through [cross-cutting-checklist.md](cross-cutting-checklist.md) against the actual implementation, not assumptions.

**5. Draft or update**

- No spec: draft from `docs/specs/templates/feature-spec.template.md` and write to `docs/specs/features/[feature-name].md`
- Existing spec: update to match current behavior. Flag spec-vs-code divergences as `REVIEW NEEDED` flags rather than silently resolving them.

Add or update the entry in `docs/specs/SPECS.md`.

---

## Revise

Use this mode when a spec already exists but has open flags, gaps, or NOT SPECIFIED sections that need design decisions before implementation can begin. The spec is the source of truth — the goal is to produce something complete enough to hand to an implementer.

**1. Read the spec** — Read `docs/specs/features/[feature-name].md` in full. Catalogue every open item:

- `NOT SPECIFIED` flags — behavior that has never been decided
- `REVIEW NEEDED` flags — behavior that exists but needs a decision
- `AMBIGUOUS` flags — behavior where the intent is unclear
- Missing sections (e.g. no Telemetry section, empty edge case table)

**2. Read the existing code** — Find and read the relevant implementation files to understand what is already built vs. what is a stub or placeholder. Treat the code as evidence of current state, not as a constraint on what the spec should say.

**3. Triage open items** — Present the catalogued items to the user grouped by type. For each one, determine:

- Is this a **decision to make now** (drives implementation)?
- Is this **explicitly out of scope** (move to Out of Scope)?
- Is this a **known future item** (keep as a flag but label clearly)?

Work through decisions conversationally. Do not resolve a flag by guessing — if the user doesn't have an answer, leave it flagged with a clearer question.

**4. Brainstorm gaps** — Once open flags are triaged, check whether any scenarios or personas are missing that would surface additional requirements. Use the same brainstorm approach as Greenfield step 2–3, but focused on what the existing spec does not cover.

**5. Cross-cutting analysis** — Read and work through [cross-cutting-checklist.md](cross-cutting-checklist.md) against the **intended** behavior (decisions made in step 3), not the current code. Flag anything still unresolved.

**6. Update the spec** — Rewrite or update `docs/specs/features/[feature-name].md`:

- Replace resolved flags with acceptance criteria or edge case table rows
- Remove flags that are explicitly out of scope (add to Out of Scope section instead)
- Keep unresolved flags but sharpen their language to a clear question with an owner
- Update the spec status field if it has advanced (e.g. `draft` → `review`)

---

## Quality check before saving

Before writing the file, verify:

- Every user story maps to at least one acceptance criterion
- Every cross-cutting concern has been addressed or explicitly flagged
- The Telemetry section names the operation(s) and states whether domain events apply
- Anything unresolved is a named flag, not a missing section
