# ADR 0001: Phase 0 Scaffold

## Status

Accepted

## Context

FieldOps needs a production-minded backend foundation that starts simple, keeps the backend as the only active application, and still leaves space for a future frontend.

The original plan was to use Cloudflare's C3 Hono framework starter directly. During implementation, the current C3 Hono path produced a full-stack scaffold rather than an API-only Worker shape. That did not match the Phase 0 goal.

## Decision

We adopted a workspace-ready repository with:

- `apps/api` as the active Hono-on-Workers application
- `apps/web` reserved for a future frontend
- `packages` reserved for future shared code

The API scaffold uses the official Hono Cloudflare Workers starter and is layered with Wrangler configuration, workspace tooling, CI, tests, request IDs, and structured request logging.

## Consequences

- The backend starts from the correct Hono Worker shape without premature frontend code.
- The repository is ready for a future UI without forcing a repo migration.
- Platform services such as D1, Better Auth, Queues, and Durable Objects remain intentionally deferred until their phases begin.
