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
pnpm dev                 # wrangler dev (http://localhost:8787)
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
- **API contract** → [`docs/reference/api.md`](docs/reference/api.md), `docs/reference/openapi.json`
- **Data shapes** → [`docs/reference/data-model.md`](docs/reference/data-model.md)
- **Product features** → [`docs/product/features.md`](docs/product/features.md)
- **How we document** → [`docs/README.md`](docs/README.md)

## Workflow

Work on a branch, open a PR (CI must pass), merge → auto-deploys to Cloudflare.
Don't commit to `main` directly. End commit messages with the Co-Authored-By
trailer.
