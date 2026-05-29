# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Pineapple project, using the [MADR](https://adr.github.io/madr/) (Markdown Architectural Decision Records) format.

## What is an ADR?

An ADR captures a significant architectural decision: the context that made it necessary, the options considered, the choice made, and its consequences. The goal is to make future readers (including future you) understand not just _what_ was decided, but _why_ — and why the alternatives were rejected.

## When to write one

Write an ADR when:

- The decision is hard to reverse or costly to change later
- There were real alternatives worth documenting
- You find yourself explaining the same design choice more than once
- A future developer reading the code would reasonably ask "why did they do it this way?"

Don't write one for every little choice — save them for decisions that carry architectural weight.

## Numbering and status

Files are named `NNNN-short-title-with-hyphens.md` using four-digit zero-padded numbers (e.g. `0001-use-madr-for-adrs.md`). Numbers are assigned sequentially and never reused.

**Valid statuses:**

| Status                                | Meaning                             |
| ------------------------------------- | ----------------------------------- |
| `proposed`                            | Under discussion, not yet decided   |
| `accepted`                            | The current, active decision        |
| `deprecated`                          | No longer relevant but not replaced |
| `superseded by [NNNN](NNNN-title.md)` | Replaced by a newer ADR             |

## Template

Use [`0000-template.md`](0000-template.md) as your starting point.

**Full form** — use when there were real alternatives to weigh:

- Context and Problem Statement
- Decision Drivers
- Considered Options (with pros/cons per option)
- Decision Outcome + Consequences

**Short form** — use for smaller/clearer decisions. Drop the per-option pros/cons and go straight to:

- Context and Problem Statement
- Decision Outcome + Consequences

## Index

<!-- Keep this list up to date as ADRs are added -->

| #                                                                | Title                                            | Status   |
| ---------------------------------------------------------------- | ------------------------------------------------ | -------- |
| [0001](0001-use-madr-for-adrs.md)                                | Use MADR for architecture decision records       | accepted |
| [0002](0002-use-tactical-ddd-patterns-for-the-domain-layer.md)   | Use tactical DDD patterns for the domain layer   | accepted |
| [0003](0003-monorepo-layer-architecture-and-dependency-rules.md) | Monorepo layer architecture and dependency rules | accepted |
| [0004](0004-error-handling-strategy.md)                          | Error handling strategy                          | accepted |
| [0005](0005-repository-contract.md)                              | Repository contract                              | accepted |
| [0006](0006-deployment-platform.md)                              | Deployment platform                              | accepted |
| [0007](0007-api-validation-boundary.md)                          | API validation boundary                          | accepted |
| [0008](0008-documentation-method.md)                             | Documentation method                             | accepted |
