# Pineapple

`pineapple` is the workspace for **FieldOps**, a Cloudflare-first backend learning project that starts as a modular monolith and leaves room for a future UI.

## Workspace Layout

- `apps/api`: active Cloudflare Worker API built with Hono
- `apps/web`: reserved location for the future Cloudflare-hosted frontend
- `packages`: reserved for shared contracts, types, and utilities once multiple consumers exist
- `docs`: architecture notes and decision records

## Phase 0 Scope

Phase 0 sets the foundation only:

- TypeScript, Wrangler, and Hono
- linting and formatting
- Workers-native testing with Vitest
- request ID middleware and structured request logging
- root workspace scripts and CI

Deferred until later phases:

- Better Auth
- D1
- Queues
- Durable Objects
- GraphQL
- frontend implementation

## Commands

From the repo root:

```sh
pnpm install
pnpm dev
pnpm check
pnpm deploy
```

The local API dev server runs on `http://localhost:8790`.

## Production Hostname

The API Worker is configured for the Cloudflare Custom Domain `pineapple.tylerevans.co`.

- Current API base path: `https://pineapple.tylerevans.co/api/v1`
- Current root response: `https://pineapple.tylerevans.co/` returns service metadata until the UI exists

When you deploy with `pnpm deploy`, Cloudflare will create the DNS record and certificate for this hostname as long as there is not already a conflicting DNS record on `pineapple.tylerevans.co`.
