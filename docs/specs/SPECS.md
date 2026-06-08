> **Audience:** everyone · **Purpose:** top-level map of the spec system · **Source of truth:** this file · **Last reviewed:** 2026-06-08

# Spec Index

The spec system captures product behavior and intent — what a feature is supposed
to do and why — so the objective record survives as code changes over time. Specs
are not API contracts (those live in `docs/reference/openapi.json`) and not
decisions about _how_ we built something (those live in `docs/decisions/`). They
answer: **what should this do, for whom, and under what conditions?**

## Specs are organized by package

A "feature" used to mean one document covering both an API and its UI. That got
muddy: a capability with an API the frontend doesn't use, or a screen with no
backend, didn't fit one shape. **Specs now live with the package they describe:**

| Where                                              | Covers                                                              | Index                                           |
| -------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| [`apps/api/specs/`](../../apps/api/specs/SPECS.md) | **API capabilities** — endpoints, validation, ownership, telemetry  | [API spec index](../../apps/api/specs/SPECS.md) |
| [`apps/web/specs/`](../../apps/web/specs/SPECS.md) | **UX** — screens, states, copy, interactions                        | [Web spec index](../../apps/web/specs/SPECS.md) |
| [`docs/specs/universal/`](./universal/)            | **Cross-package contracts** — the seam where API and web must agree | this directory                                  |

A feature that spans both packages becomes **two specs** — one capability spec in
`apps/api`, one UX spec in `apps/web` — that link to each other. Either can exist
without the other (an API with no UI; a screen with no backend). Cross-cutting
concerns are split the same way: each package owns its half (see each package
index), and only the genuine API↔web contracts stay universal.

## Universal Contracts

The thin set of contracts both packages must implement identically. Each package's
cross-cutting specs reference these rather than redefining them.

| Contract                                               | The seam it governs                                    | Status |
| ------------------------------------------------------ | ------------------------------------------------------ | ------ |
| [error-envelope.md](./universal/error-envelope.md)     | The `{ error, field }` error wire shape + status codes | active |
| [session-contract.md](./universal/session-contract.md) | Session cookie transport, 401 semantics, get-session   | active |

## Package Spec Indexes

- **[API specs](../../apps/api/specs/SPECS.md)** — capabilities and the API-side
  cross-cutting concerns (auth resolution, permissions, validation, error mapping,
  telemetry).
- **[Web specs](../../apps/web/specs/SPECS.md)** — screens and the web-side
  cross-cutting concerns (auth/401 handling, UX validation, error rendering,
  loading states).

## Shared Tooling

These remain centralized because they serve every package.

```
docs/specs/
  SPECS.md                        ← this file (the hub)
  universal/
    error-envelope.md
    session-contract.md
  templates/
    feature-spec.template.md      ← blank feature spec (API or web)
    cross-cutting.template.md     ← blank cross-cutting spec
  prompts/
    pr-sync.md                    ← AI prompt: sync a spec after a PR merges
```

## Workflow

**Starting a new feature:**

1. Decide which package(s) it touches. An API capability → a spec in
   `apps/api/specs/features/`. A screen → a spec in `apps/web/specs/features/`. A
   full-stack feature → both, cross-linked.
2. Copy `templates/feature-spec.template.md` into the right package's `features/`
   directory, fill it out, and add it to that package's `SPECS.md` index.
3. Reference the relevant cross-cutting specs from the **same package**, and any
   [universal contract](./universal/) at the API↔web seam.

**Adding a new cross-package contract:** only when both packages must agree on a
wire-level shape. Add it under `universal/` and link it from both packages.

**After a PR merges:** run `prompts/pr-sync.md` against the diff to classify
changes and update the affected package spec(s) if behavior changed.
