# Pineapple

Field-operations app for tracking **assets** — vehicles, properties, and
equipment — and the work done around them. Built for a two-person team, on a
stack that stays cheap and fast at small scale and is disciplined enough to grow.

> **New here? Pick your door.** This README is the human overview. If you're an
> AI agent, start with [`CLAUDE.md`](CLAUDE.md). For everything else, see the
> [documentation map](#documentation) below.

## Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Runtime        | Cloudflare Workers (`nodejs_compat`)                |
| Database       | Cloudflare D1 (SQLite) with tracked migrations      |
| HTTP framework | Hono + `@hono/zod-openapi`                          |
| Auth           | Better Auth + Google OAuth                          |
| Validation     | Zod (the same schemas generate the OpenAPI spec)    |
| Language       | TypeScript, source-first (no build step), strict    |
| Monorepo       | pnpm workspaces                                     |
| Architecture   | Domain-Driven Design with enforced layer boundaries |

## Quickstart

```bash
pnpm install

# Terminal 1: run the API locally (http://localhost:8787)
pnpm --filter @snaveevans/pineapple-api dev

# Terminal 2: run the web app (http://localhost:5173)
# Vite proxies same-origin /api/* requests to the API Worker.
pnpm --filter @snaveevans/pineapple-web dev

# Apply the database schema to your local D1
pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations apply pineapple --local

# Quality gates (what CI runs)
pnpm lint
pnpm type-check
pnpm -r test
```

Local secrets live in `apps/api/.dev.vars` (gitignored). Set `DEV_AUTH_EMAIL`
there to bypass the login flow during development. See
[`docs/guides/getting-started.md`](docs/guides/getting-started.md) for the full
setup, including Google OAuth.

## Project structure

```
apps/api/             The Cloudflare Worker (the whole backend today)
  src/
    domain/           Aggregates, value objects, domain events  (no deps)
    application/      Use cases + ports                         (depends on domain)
    infrastructure/   D1 repositories, Better Auth wiring       (depends on application)
    api/              HTTP schemas + OpenAPI specs              (depends on application)
    worker.ts         Composition root — wires everything, defines routes
  scripts/            Build-time tooling (OpenAPI generation)
packages/shared/      Cross-cutting primitives: branded IDs, Result, errors
migrations/           D1 SQL migrations (tracked by wrangler)
docs/                 All documentation (see below)
```

Dependencies only ever point inward (`shared ← domain ← application ←
infrastructure`); `worker.ts` is the one place allowed to touch every layer.
ESLint enforces this — see [ADR-0003](docs/decisions/0003-monorepo-layer-architecture-and-dependency-rules.md).

## Documentation

Docs are organized by **what you need**, not by who you are. Start with the row
that matches your goal:

| You want to…                                 | Read                                                               |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Call the API from a UI                       | [`docs/reference/api.md`](docs/reference/api.md) + the live spec¹  |
| Know what data exists (fields, types, enums) | [`docs/reference/data-model.md`](docs/reference/data-model.md)     |
| Understand what the product does             | [`docs/product/features.md`](docs/product/features.md)             |
| See what's planned / where to improve        | [`docs/product/roadmap.md`](docs/product/roadmap.md)               |
| Run, test, or deploy the project             | [`docs/guides/getting-started.md`](docs/guides/getting-started.md) |
| Understand _why_ something is built a way    | [`docs/decisions/`](docs/decisions/) (ADRs)                        |
| Understand how we document (the method)      | [`docs/README.md`](docs/README.md)                                 |

¹ The OpenAPI spec is committed at
[`docs/reference/openapi.json`](docs/reference/openapi.json) and served live at
`GET /openapi.json`, with interactive docs at `/reference`.

## Deployment

Merging to `main` auto-deploys the Worker via GitHub Actions (migrations are
applied first, then `wrangler deploy`). See
[ADR-0006](docs/decisions/0006-deployment-platform.md) and
[`docs/guides/getting-started.md`](docs/guides/getting-started.md#deployment).
