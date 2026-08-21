---
name: adr-author
description: Author, capture, or supersede an Architecture Decision Record (ADR). Keeps ADRs at decision altitude — the choice, its drivers, the options weighed, and the consequences — and pushes implementation mechanism down into feature specs. Treats the ADR collection as an append-only ledger.
---

Work conversationally. Confirm the decision, its drivers, and the rejected options before writing. Do not generate a full draft until the steps below are complete.

## ADRs are a ledger

The collection in `docs/decisions/` is an **append-only record** of decisions and the reasoning at the time each was made. This constrains everything below:

- An **accepted** ADR is immutable. Do not rewrite its context, options, or consequences to reflect later thinking — that erases the record.
- The **only** edit ever made to an existing accepted ADR is a **status flip**: `accepted` → `superseded by [NNNN](NNNN-title.md)` (or `deprecated`). Nothing else in the file changes.
- To change a past decision you **write a new ADR** that supersedes the old one. History stays intact; the new record explains what changed and why.
- A `proposed` ADR is the one exception: it is still a draft under discussion and may be refined until it is accepted. Once it flips to `accepted`, hands off.

If you feel the urge to edit an accepted ADR's body, stop — that urge is the signal to author a _superseding_ ADR instead.

## Existing ADRs

!`ls docs/decisions/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null | sort`

The next number is the highest above + 1, zero-padded to four digits. Numbers are assigned sequentially and never reused.

## House rules live in the README

`docs/decisions/README.md` is canonical for statuses, numbering, and the full-vs-short form — read it rather than duplicating its rules. In short: full form when there were real alternatives to weigh; short form for smaller/clearer decisions. Start every draft from `docs/decisions/0000-template.md`.

## Is this even an ADR?

Before drafting, apply the README's "When to write one" test: an ADR is warranted when the decision is hard to reverse, there were real alternatives, or a future reader would ask "why did they do it this way?"

Be willing to say **no**:

- If it's **how a feature behaves or is built**, that's a spec detail — it belongs in `docs/specs/`, not an ADR (see the altitude checklist).
- If it's a small, obvious, or easily reversed choice, a code comment is enough.

Naming an ADR you should _not_ write is a success, not a failure.

## Figure out what you're doing

Infer the mode from the conversation; confirm it in one line and only ask when genuinely ambiguous.

- A decision is being made now, or the user wants to propose one → **Author**
- A decision already lives in the code but was never recorded → **Capture**
- An existing decision is changing, being retired, or replaced → **Supersede**

---

## Author

A new decision, recorded now.

**1. Decision** — State it in one sentence. What is being chosen? Do not proceed until it's crisp and singular — one ADR records one decision.

**2. Context** — What situation forces this decision? What constraints and forces are in play? This is the problem statement, not the solution.

**3. Drivers** — Name the qualities, constraints, and concerns that shape the choice (e.g. reversibility, operational cost, team size, consistency with existing layers). These are what the options get judged against.

**4. Options** — Surface the alternatives a thoughtful reader would ask about. If there was only ever one option, reconsider whether this needs an ADR at all. For each option, capture honest pros and cons against the drivers — not straw men.

**5. Outcome & consequences** — The chosen option and why it wins on the drivers. Then the consequences, **both** positive and negative. An ADR with only upsides is not honest; name the trade-off you're accepting.

**6. Altitude pass** — Work through [decision-altitude-checklist.md](decision-altitude-checklist.md). This is where mechanism gets caught and pushed down into a spec.

**7. Draft** — Read `docs/decisions/0000-template.md`, fill it in, and write to `docs/decisions/NNNN-short-title.md` with the next sequential number. Set the status (`proposed` or `accepted` — confirm which) and today's date. Then add the row to the index table in `docs/decisions/README.md`.

---

## Capture

A decision already embodied in the code that was never written down — the retroactive analog.

**1. Locate the decision** — Find the code, config, or convention that embodies it. Confirm with the user what the decision actually was.

**2. Reconstruct the reasoning** — What alternatives were available at the time? What drove the choice? The record is only worth writing if the _why_ is captured, not just the _what_. Flag anything you're inferring rather than confirming.

**3. Consequences as lived** — Being retroactive, you may know consequences that have actually materialized. Record them honestly.

**4. Altitude pass** — Work through [decision-altitude-checklist.md](decision-altitude-checklist.md).

**5. Draft** — Same as Author step 7. A captured decision already in force is usually `accepted`, dated today (the date the record was made). If the decision predates the record, say so in Context.

---

## Supersede

An existing decision is changing, being replaced, or retired. **This is the only mode that touches an existing ADR — and only its status line.**

**1. Identify the old ADR** — Which record is changing? Read it in full so the new one can speak to what's actually there.

**2. Choose the transition:**

- **Superseded** — a new decision replaces it. Author a _new_ ADR (run the Author steps) that states what changed relative to the old one and why. Then flip the old ADR's status to `superseded by [NNNN](NNNN-title.md)`, linking the new record. Nothing else in the old file changes.
- **Deprecated** — the decision no longer applies but nothing replaces it. Flip the old ADR's status to `deprecated`. No new ADR is needed unless the user wants to record the reasoning.

**3. Never rewrite the old body.** If the old ADR's context or options read as wrong now, that's precisely what a superseding record is for — the new ADR explains the shift; the old one stays as the historical account.

**4. Update the index** — Reflect the new status (and any new ADR) in the `docs/decisions/README.md` table.

---

## Quality check before saving

- The ADR records **one** decision, stated plainly.
- Nothing in the body is implementation mechanism that belongs in a spec — the altitude checklist passed.
- There are real, honestly argued options — or the short form is used because there genuinely weren't.
- Consequences include at least one accepted trade-off, not only benefits.
- The number is sequential and unused; the README index is updated.
- No existing accepted ADR was edited except a status flip.
