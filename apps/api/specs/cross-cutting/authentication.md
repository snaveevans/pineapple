---
audience: API contributors
purpose: how the API resolves identity from a session — backend half of auth
source: this file
date: 2026-06-08
---

# Authentication (API) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/api`
**Applies To:** All `/api/*` routes unless listed in Exceptions
**Universal contract:** [session-contract.md](../../../../docs/specs/universal/session-contract.md)

---

## Summary

The API never assumes identity — it resolves a domain `User` from the Better Auth
session on every protected request and hands it to the route handler via context.
Better Auth owns the OAuth flow and session cookie lifecycle; the API owns the
domain `User` resolved from it. The wire-level handshake (cookie transport, 401
semantics, the unauthenticated route list) is the
[universal session contract](../../../../docs/specs/universal/session-contract.md);
this spec covers the backend resolution behavior only.

## Canonical Behavior

- Better Auth is mounted at `/api/auth/*` and owns the `user`, `session`,
  `account`, and `verification` tables.
- All `/api/*` routes outside `/api/auth/*` are protected by the
  `BetterAuthResolver` middleware registered in `worker.ts`.
- The middleware calls `resolver.resolve()`, which reads the session cookie,
  validates it, and provisions a domain `User` JIT from the Better Auth record
  (keyed on email). The domain `User` lives in the separate `users` table.
- If no valid session exists, the middleware throws `UnauthorizedError` → 401
  (the 401 the web side keys its redirect on; see the session contract).
- In local development, `DEV_AUTH_EMAIL` in `.dev.vars` bypasses session
  validation and injects a synthetic user. This must never reach production.

## Feature Integration Contract

Every API feature spec must document:

- Whether the route is accessible unauthenticated (only the routes in the
  [session contract](../../../../docs/specs/universal/session-contract.md)
  unauthenticated table qualify).
- Whether the feature uses the resolved `User.id` as a domain input (e.g. as
  `requesterId` or `ownerId`). Ownership rules live in [permissions.md](./permissions.md).

## Exceptions

| Route / Feature                   | Deviation                     | Reason                                    |
| --------------------------------- | ----------------------------- | ----------------------------------------- |
| Google OAuth flow (`/api/auth/*`) | Unauthenticated by definition | Initiates the session; cannot require one |
| `GET /health`                     | Unauthenticated               | Operational liveness check                |
| `GET /openapi.json`               | Unauthenticated               | Public API spec                           |
| `GET /reference`                  | Unauthenticated               | Public API documentation UI               |

## Anti-Patterns

- **Checking the session inside a route handler:** Route handlers receive the
  resolved `User` from middleware context — they must not re-read the session
  cookie or call Better Auth directly.
- **Hardcoding `DEV_AUTH_EMAIL` values in tests:** Use the test harness auth
  injection instead. `DEV_AUTH_EMAIL` is a local-dev escape hatch only.

## Known Issues

- Session JIT provisioning publishes a `UserProvisioned` domain event the first
  time a `User` is created. Its telemetry contract is owned by the API sign-in
  feature spec ([features/sign-in.md](../features/sign-in.md)) and
  [telemetry.md](./telemetry.md).
