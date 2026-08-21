---
name: spec-author
description: Draft, document, or revise a feature spec. Walks through persona brainstorming, scenarios, user stories, and all six cross-cutting concerns.
---

Work conversationally. Ask questions and confirm assumptions before writing. Do not generate a full draft until the steps below are complete.

## Existing specs

!`find docs/specs/features -name "*.md" 2>/dev/null | sort`

## Where specs live

Specs live in `docs/specs/features/`. They describe API capabilities — endpoints, validation, ownership, domain behavior, and telemetry. UX intent for the web app is documented separately in `docs/web/FEATURES.md` — not as full specs.

## Figure out what you're doing

Do NOT expect a command argument. Infer the mode from the conversation and the repo,
confirm it in one line, and only ask when genuinely ambiguous:

- The feature/code doesn't exist yet, or the user describes something to build →
  **Greenfield** (author a new spec)
- The user points at existing code, or a spec is missing for code that already
  exists → **Brownfield** (document current behavior)
- A spec already exists and the user wants to complete/sharpen it → **Revise**
  (complete a draft and make it implementation-ready; the spec drives the code, not
  the other way around)

If the user's message already makes the mode and feature obvious, state your reading
and proceed. If not, ask which of the three they want and what the feature is. The
`Existing specs` list above is your reference for what already exists.

---

## Greenfield

**1. Intent** — Ask for the user problem this feature solves in one sentence. Do not proceed until you have it.

**2. Name** — From the intent and the capability/screen described, propose a kebab-case spec name (e.g. `archive-asset`, `service-queue`). Present it as a suggestion and ask the user to confirm or replace it. **Always take the user's chosen name** — your suggestion is only a starting point. Use the agreed name for the spec file(s).

**3. Personas** — Identify all actors. Start with the primary persona (authenticated owner-operator for app features; unauthenticated visitor for public pages) then expand:

- Different states of the primary user (new user with no data, established user, user mid-flow)
- Secondary personas (future team members, delegates)
- System actors (background jobs, webhooks, scheduled tasks)

**4. Scenarios** — For each persona, generate scenarios across three categories:

- **Happy path** — the intended flow from entry to success
- **Error and edge cases** — empty state, validation failure, API error, 401, slow network, concurrent actions
- **Lifecycle transitions** — before/during/after states; navigation on success and failure

**5. User stories** — Derive from scenarios using: "As a **[persona]**, I can **[action]** so that **[outcome]**." Every significant scenario should map to at least one story.

**6. Cross-cutting analysis** — Read and work through [cross-cutting-checklist.md](cross-cutting-checklist.md). Ask the user about unknowns rather than guessing.

**7. Delivery plan & sizing** — Partition the feature into **slices**: independently-reviewable increments, each shippable in one PR within the repo's scope budget (CLAUDE.md — ~40 files / ~800 net lines is the signal to split, not a target). A slice is usually one coherent group of criteria (e.g. backend mechanism → read-path → web surface); large features legitimately have several (teams-foundation has five). Split into a **separate feature spec** only when the parts don't share domain/schema/invariants. Fill the template's **Delivery Plan** table (`Slice | Scope | Issue | Depends on`) and **tag every acceptance criterion with exactly one slice** (`` `S1` ``…); a criterion that resists a single tag is too coarse — split it. A single-PR feature still tags every box `S1` and uses the one-line plan.

**8. Draft** — Read the template at `docs/specs/templates/feature-spec.template.md`, fill it in, and write the spec to `docs/specs/features/[name].md`. Add an entry to `docs/specs/SPECS.md`. Set `status: review` for an unbuilt spec (it becomes `in-progress` when the first slice ships, `active` when the last box is checked). If the feature has a web UI, note in the spec summary that UX intent belongs in `docs/web/FEATURES.md`.

---

## Brownfield

**1. Locate the code** — Find relevant files: route handler in `apps/api/src/api/` or `worker.ts`, use case in `apps/api/src/application/usecases/`, UI component in `apps/web/src/`. Ask if unclear.

**2. Check for an existing spec** — Look in `docs/specs/features/` using the `Existing specs` list above to locate or rule out an existing spec. If one exists, read it and note any gaps between spec and code.

**3. Describe current behavior** — Summarize what the code actually does: inputs → validation → domain logic → outputs → side effects. Confirm with the user before proceeding.

**4. Cross-cutting analysis** — Read and work through [cross-cutting-checklist.md](cross-cutting-checklist.md) against the actual implementation, not assumptions.

**5. Draft or update**

- No spec: draft from `docs/specs/templates/feature-spec.template.md` and write to `docs/specs/features/[name].md`
- Existing spec: update to match current behavior. Flag spec-vs-code divergences as `REVIEW NEEDED` flags rather than silently resolving them.

Add or update the entry in `docs/specs/SPECS.md`.

---

## Revise

Use this mode when a spec already exists but has open flags, gaps, or NOT SPECIFIED sections that need design decisions before implementation can begin. The spec is the source of truth — the goal is to produce something complete enough to hand to an implementer.

**0. Locate the spec** — If the user hasn't pinpointed a file, list the specs from the `Existing specs` output above and have the user pick. Confirm the exact file path before reading.

**1. Read the spec** — Read `docs/specs/features/[name].md` in full. Catalogue every open item:

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

**6. Update the spec** — Rewrite or update `docs/specs/features/[name].md`:

- Replace resolved flags with acceptance criteria or edge case table rows
- Remove flags that are explicitly out of scope (add to Out of Scope section instead)
- Keep unresolved flags but sharpen their language to a clear question with an owner
- Any acceptance criterion you add or resolve carries **exactly one slice tag** (`` `S1` ``…) tying it to the Delivery Plan; put it in an existing slice or add a new slice row
- If the spec predates slicing (no Delivery Plan), add the Delivery Plan table and tag the existing criteria as part of the revision
- Update the spec status field if it has advanced (`draft`→`review`; `review`→`in-progress` once a slice has shipped; `active` only when no `[ ]` remain)

---

## Quality check before saving

Before writing the file, verify:

- The spec lives in `docs/specs/features/`
- Every user story maps to at least one acceptance criterion
- Each acceptance criterion is **atomic and independently testable** — it becomes a checkbox on the spec's live implementation checklist, checked off (and backed by a test) one at a time as the feature is built (see `docs/specs/SPECS.md`)
- The **Delivery Plan** lists the slices, and **every acceptance criterion carries exactly one slice tag** (`` `S1` ``…) — no orphans (see `docs/specs/SPECS.md`)
- Every cross-cutting concern has been addressed or explicitly flagged
- The Telemetry section names the operation(s) and states whether domain events apply
- If the feature has a web UI, confirm the relevant entry in `docs/web/FEATURES.md` is up to date
- `status` is set correctly: `review` if unbuilt, `in-progress` once ≥1 slice has shipped, `active` only when **no `[ ]` remain**
- Anything unresolved is a named flag, not a missing section
