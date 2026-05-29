# Use MADR for Architecture Decision Records

- Status: accepted
- Date: 2026-05-21

## Context and Problem Statement

As a DDD project, Pineapple will accumulate non-obvious design choices over time — aggregate
boundaries, consistency strategies, cross-package contracts, and infrastructure trade-offs.
Without a lightweight record of _why_ decisions were made, future contributors (and future us)
will either repeat the deliberation or, worse, silently undo choices that had good reasons behind
them.

We need a format that is low enough friction to actually be used, but structured enough to capture
the reasoning — not just the outcome.

## Decision Drivers

- Must be plain Markdown — no tooling required to read or write
- Should capture considered alternatives, not just the winning choice
- Must have a short form for smaller decisions and a full form for significant ones
- Prefer a format with community momentum and existing examples to reference

## Considered Options

- [MADR](https://adr.github.io/madr/) — Markdown Architectural Decision Records
- [Nygard's original format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — the minimal five-section ADR
- RFC-style (Request for Comments)

## Decision Outcome

Chosen option: **MADR**, because the "Considered Options" section with per-option pros/cons
directly serves the DDD context. When deciding between aggregate designs or domain patterns,
the value is in seeing why alternatives were rejected — not just what was chosen. MADR makes
that a first-class part of the record, and its short form keeps overhead low for smaller calls.

### Positive Consequences

- Decisions are self-documenting in the repository alongside the code they explain
- The short/full form split means the format scales to both quick calls and significant choices
- New contributors have a clear, findable record of why the codebase is shaped the way it is

### Negative Consequences

- Requires discipline to actually write ADRs at the right moments — tooling won't enforce this
- The full form can feel over-engineered for genuinely small decisions; resist the urge to
  fill every field for every record

---

## Pros and Cons of the Options

### MADR

- ✅ Good, because "Considered Options" captures rejected alternatives explicitly
- ✅ Good, because short form / full form flexibility matches the range of decision sizes
- ✅ Good, because actively maintained with clear versioning and examples
- ❌ Bad, because the full form has more fields than some decisions warrant

### Nygard's original format

- ✅ Good, because extremely minimal — five sections, pure prose, zero ceremony
- ✅ Good, because it is the original and most widely recognised ADR shape
- ❌ Bad, because no dedicated "Considered Options" section — alternatives end up buried in
  Context or omitted entirely

### RFC-style

- ✅ Good, because the proposal → comment → decision lifecycle is explicit and auditable
- ❌ Bad, because the process overhead is designed for org-wide or language-level decisions,
  not day-to-day design choices within a single codebase
- ❌ Bad, because it introduces a separate workflow on top of normal development
