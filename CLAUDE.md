# CLAUDE.md

Orientation for AI agents working in this repo. Read this first; it points to
everything else.

## What this is

**Pineapple** — a field-operations app for tracking assets (vehicles,
properties, equipment) for a two-person team. The backend is a single
Cloudflare Worker (`apps/api`). The frontend (`apps/web`) is a Vite + React
app served by a Cloudflare Worker — it currently hosts the marketing home page
(see [`apps/web/README.md`](apps/web/README.md)).

## Stack & runtime constraints

- **Cloudflare Workers** runtime (not Node). `nodejs_compat` is on, but treat
  Node built-ins as unavailable: ESLint **blocks** `fs`, `path`, `http`, `os`,
  `child_process`, etc. in `apps/api/src/**`. Use WinterCG/Web APIs. (ADR-0006)
- **No `process.env`** in `apps/api/src/**` — also lint-blocked. Read config
  from the Worker `env` binding (`c.env.*`), typed in `worker.ts`.
- **D1 (SQLite)** via the `DB` binding. Migrations in `/migrations`, applied
  with `wrangler d1 migrations apply pineapple --local|--remote`.
- **Cloudflare Queues** are declared in `apps/api/wrangler.jsonc` but `wrangler
deploy` does NOT create them — it binds to existing queues and fails if one
  is missing. Provisioning is IaC: the "Ensure Queues exist" step in
  `.github/workflows/deploy.yml` idempotently creates every declared queue before
  deploying. Adding a queue means editing both places (see the comment in
  `wrangler.jsonc`).
- **Source-first TypeScript**: no build step. Imports use explicit `.ts`
  extensions (e.g. `import { User } from "./User.ts"`). Keep that convention.
- **pnpm workspaces**: `packages/*`, `apps/*`. Package manager pinned via
  `packageManager` in `package.json` (pnpm 10).

## Architecture — layers & dependency rules (ADR-0003)

Dependencies point inward only. ESLint (`eslint-plugin-boundaries`) enforces
this; a violation fails `pnpm lint`.

```
shared  ←  domain  ←  application  ←  infrastructure
                   ↖  api                ↑
                       worker.ts (composition root — may import anything)
```

| Layer (path)                     | May import                  | Holds                                           |
| -------------------------------- | --------------------------- | ----------------------------------------------- |
| `packages/shared/**`             | (nothing internal)          | branded IDs, `Result`, `DomainError` subclasses |
| `apps/api/src/domain/**`         | shared                      | aggregates, value objects, domain events        |
| `apps/api/src/application/**`    | domain, shared              | use cases, ports (interfaces)                   |
| `apps/api/src/infrastructure/**` | application, domain, shared | D1 repositories, Better Auth wiring             |
| `apps/api/src/api/**`            | application, domain, shared | HTTP/Zod schemas, OpenAPI route specs           |
| `apps/api/src/worker.ts`         | anything                    | composition root: wires deps, defines routes    |

**Key consequence:** the `api/` layer must NOT import `infrastructure/`. Route
_specs_ (pure schemas) live in `api/`; route _handlers_ that instantiate
repositories live in `worker.ts`. Keep it that way.

## Conventions

- **Errors:** use cases return `Result<T, DomainError>` (`ok`/`err` from
  `@snaveevans/pineapple-shared`). HTTP handlers `throw` domain errors; the
  central `app.onError` in `worker.ts` maps them to status codes via
  `api/errors.ts`. `DomainError` subclasses: `NotFoundError` (404),
  `UnauthorizedError` (401), `ForbiddenError` (403), `ValidationError` (422),
  `ConflictError` (409), `InvariantError` (500). (ADR-0004)
- **Branded types:** `UserId`, `AssetId`, `Email` are branded — construct via
  `.from()` / `.generate()`, never raw strings. (ADR-0002)
- **`exactOptionalPropertyTypes` is on.** Absent ≠ `undefined`. Zod
  `.optional()` yields `T | undefined`, so casting to domain types at the
  boundary is sometimes required (see `worker.ts`).
- **Validation boundary:** Zod validates at the HTTP edge (ADR-0007). The
  schemas in `api/schemas/` use `z` from `@hono/zod-openapi` and carry
  `.openapi()` metadata — they are the single source for both validation and
  the generated API spec.
- **Computed fields belong in the API:** derived values — status labels
  (`overdue`/`soon`/`ok`), counts per bucket, available filter categories —
  are computed in the application layer and included in read model responses.
  Clients render what the API gives them; they do not recompute business logic
  from raw data. UI-only state (which filter is selected, hover state) stays in
  the client. (ADR-0009)
- **Smart Events (ADR-0009 at the event boundary):** domain events consumed by
  **durable** handlers (projections, audit/History, future async workers) carry the
  descriptive **state** and producer-owned **derived conclusions** those consumers
  need — so a consumer never re-reads the source or re-derives business logic. Carry
  domain state and conclusions, never presentation copy; cross-aggregate fields (e.g.
  an asset name on a maintenance event) are assembled in the application layer, not by
  an aggregate. Telemetry handlers stay thin selective readers and must not write the
  PII-bearing fields to Analytics Engine. (ADR-0010)

## API documentation is generated — don't hand-edit the spec

The OpenAPI document is generated from the Zod route specs in
`apps/api/src/api/openapi.ts`. To change the contract, edit the **specs/schemas**,
then regenerate:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
```

This writes `docs/reference/openapi.json` (committed). CI fails if it's stale.
The same spec is served live at `GET /openapi.json` with a Scalar UI at
`/reference`. Never edit `openapi.json` by hand.

**`openapi.json` is the single source of truth for API contracts.** Do not
duplicate field names, types, validation rules, or metadata shapes in
`docs/reference/data-model.md` or anywhere else. `data-model.md` covers only
what the spec cannot express: domain entities not exposed via HTTP (e.g.
`User`), internal fields hidden from API responses (e.g. `ownerId`), branded
value objects, domain events, and storage/table mapping. If you find yourself
writing a field table that mirrors a spec schema, stop — link to the spec
instead.

## Commands

```bash
pnpm --filter @snaveevans/pineapple-api dev   # wrangler dev (http://localhost:8787)
pnpm --filter @snaveevans/pineapple-web dev   # vite (http://localhost:5173), proxies /api/*
pnpm lint                # eslint (includes layer-boundary + Workers constraints)
pnpm type-check          # tsc --noEmit across workspace
pnpm -r test             # vitest (domain tests live in apps/api/src/**)
pnpm --filter @snaveevans/pineapple-api openapi:generate   # regenerate the spec
pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations apply pineapple --local
```

Always run `pnpm lint && pnpm type-check && pnpm -r test` before committing.

## Auth model

Better Auth + Google OAuth runs inside the Worker. It owns the singular tables
`user`/`session`/`account`/`verification`. The **domain** `User` lives in the
separate `users` table and is JIT-provisioned by email in
`infrastructure/auth/BetterAuthResolver.ts`. `/api/auth/*` is handled by Better
Auth; all other `/api/*` routes require a session (or `DEV_AUTH_EMAIL` locally).
Secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`) are Cloudflare Worker
secrets, never committed.

## Where to look

- **Why** anything is built a certain way → [`docs/decisions/`](docs/decisions/) (ADRs, MADR format)
- **What a feature is supposed to do** → [`docs/specs/`](docs/specs/) (intent ledger; index at `docs/specs/SPECS.md`)
- **API contract** → [`docs/reference/api.md`](docs/reference/api.md), `docs/reference/openapi.json`
- **Data shapes** → [`docs/reference/data-model.md`](docs/reference/data-model.md)
- **Product behavior / features** → [`docs/specs/SPECS.md`](docs/specs/SPECS.md)
- **Web app feature intent** → [`docs/web/FEATURES.md`](docs/web/FEATURES.md)
- **How we document** → [`docs/README.md`](docs/README.md)

## Scope discipline

A branch delivers **one concern**. Scope creep — folding "and also…" work into a
live branch as you refine it — is the failure mode this section exists to prevent.
It produces sprawling PRs that are hard to review, hard to revert, and hard to
reason about. Bias toward small, single-purpose branches; several stacked PRs beat
one that does everything.

**Split by concern, not by convenience:**

- A new mechanism (queue, table, migration, ADR-level pattern) and a feature that
  uses it are **two branches**. Land the mechanism first; build the feature on top.
- Refactors, renames, and infra plumbing do **not** ride along with feature work —
  separate branch, separate PR.
- Docs-only or spec-only changes that aren't required to make the feature work can
  land on their own.

**Commit to a scope before implementing, and split when it drifts:**

- Before writing code, name the concern in one sentence and the rough set of
  files/areas you expect to touch. This is your scope budget.
- When the work wants to grow past that budget — a new concern surfaces, an
  unrelated bug begs fixing, a "quick" refactor balloons — **stop and make an
  explicit decision**: either it's genuinely part of this concern, or it becomes a
  follow-up branch. Do not silently absorb it.
- Crossing ~40 files or ~800 net lines is a **signal to stop and split**, not a
  target to reach. A large diff must be a defended choice (a genuinely
  cross-cutting feature), never an accident.

When in doubt, ask the user whether to split rather than expanding the branch.

## Workflow

Work on a branch → open a PR → CI must pass → merge → auto-deploys to Cloudflare.
Don't commit to `main` directly. End commit messages with the Co-Authored-By
trailer.

### Branch naming

```
{type}/{issue}-{slug}   # with a GitHub issue
{type}/{slug}           # without
```

- **type:** `feat` | `fix` | `docs` | `refactor` | `chore` | `ci` | `test` | `perf`
- **issue:** bare digits only (no `#`) — first segment after `type/` when numeric
- **slug:** lowercase kebab-case, short

Examples: `feat/42-team-invite`, `fix/87-null-session`, `docs/adr-0016`,
`chore/upgrade-wrangler`.

Regex: `^(feat|fix|docs|refactor|chore|ci|test|perf)/(?:[0-9]+-)?[a-z0-9]+(?:-[a-z0-9]+)*$`

### Issue linking

| Place       | Rule                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Branch      | Optional: include the issue number for human signal                                                                    |
| Commits     | `Closes #N` or `Refs #N` footer when useful                                                                            |
| **PR body** | **Required** when an issue exists: `Closes #N` / `Fixes #N` if this PR fully resolves it; `Refs #N` for partial slices |

GitHub only auto-closes/links from PR and commit text — not branch names. Use
`Refs #N` on intermediate slices; `Closes #N` only on the PR that finishes the
issue.

### Opening a PR

Use the template in `.github/pull_request_template.md`. Before opening:

1. `pnpm lint && pnpm type-check && pnpm -r test`
2. Regenerate OpenAPI if the contract changed
3. Confirm one concern (scope discipline above)

Agent shortcuts: `/start` (branch from type + optional issue + slug), `/pr`
(open PR with issue link filled in).

### After merge

When the PR lands a feature slice, run `docs/specs/prompts/pr-sync.md` against
the diff to keep the spec honest.

When making a meaningful change to `apps/web` — adding a screen, changing a user
flow, adding or removing a feature — read `docs/web/FEATURES.md` and update it to
reflect the current state.
