# Decision-Altitude Checklist

Work through each check before drafting the ADR. The goal is a record that stays at **decision altitude** — the choice and its reasoning — with no implementation mechanism leaking in. Ask the user rather than guessing.

---

## 1. Altitude — is every statement a decision, or a mechanism?

This is the core check. Go through the draft line by line. For each statement ask: **is this _what we decided and why_, or _how it's carried out_?**

- **Decision altitude (keep):** the choice, its drivers, the options weighed, the requirement or guarantee it establishes, the consequences and trade-offs.
- **Mechanism (push down):** table schemas, function/module names, step-by-step algorithms, wire formats, concrete API shapes, retry counts, config values.

When you find mechanism, don't delete the idea — **relocate it**. The ADR keeps the _requirement_; the implementing spec carries the _how_.

> Example: ADR-0011 decided that event delivery must be end-to-end at-least-once (decision). The transactional-outbox table, the atomic D1 write, and the relay (mechanism) live in `docs/specs/features/activity-history.md`, not the ADR.

For each piece of mechanism you find, name the spec it belongs in (`docs/specs/features/…` or a cross-cutting spec), flag it for the user, and offer to open or create that spec. Do **not** silently move prose between documents.

## 2. One decision

Does the ADR record a single decision? If it bundles several ("use X, and also restructure Y, and adopt Z"), split it. One decision per record keeps the ledger navigable and lets each record be superseded on its own.

## 3. Real alternatives

Were there genuinely other options a thoughtful reader would consider?

- If yes, they belong in the record (full form) — with honest pros and cons.
- If there was truly only one path, this may not warrant an ADR, or it's a short-form record. Reconsider before drafting.

## 4. Explicit drivers

Are the decision drivers named — the qualities and constraints the options are judged against? A decision whose drivers are implicit reads as arbitrary to a future reader.

## 5. Honest consequences

Are **negative** consequences and accepted trade-offs stated, not just benefits? Every real decision costs something. If you can't name a downside, you haven't found it yet.

## 6. Relationship to the ledger

- Does this decision change, narrow, or contradict an existing ADR? If so it's a **supersede** — link the old record and flip its status (see the skill's Supersede mode). Don't leave two live ADRs disagreeing.
- Does it build on an existing ADR? Reference it so the chain of reasoning stays traceable.

## 7. Records stay records

Confirm you are not editing an existing **accepted** ADR's body to fit the new decision. If the old record now reads as wrong, that is what the superseding ADR is for — leave history intact.
