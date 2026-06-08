---
name: sign-in
description: API side of sign-in — auth route telemetry operations and the UserProvisioned domain event on JIT provisioning
metadata:
  type: feature
  package: api
---

# Sign In (API)

**Status:** review
**Owner:** [unknown — assign on review]
**Package:** `apps/api`
**Last Updated:** 2026-06-08
**Web counterpart:** [apps/web/specs/features/sign-in.md](../../../web/specs/features/sign-in.md)
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [telemetry.md](../cross-cutting/telemetry.md) · [session-contract.md](../../../../docs/specs/universal/session-contract.md)

---

## Summary

The OAuth flow itself is owned by Better Auth at `/api/auth/*` (see the
[session contract](../../../../docs/specs/universal/session-contract.md) and the API
[authentication cross-cutting spec](../cross-cutting/authentication.md)). What the
**API package** adds on top of Better Auth is the part this spec covers: naming the
auth routes as telemetry operations, and publishing the `UserProvisioned` domain
event the first time a domain `User` is provisioned JIT from a Better Auth record.
The login screen UX is the
[web sign-in feature](../../../web/specs/features/sign-in.md).

## Capability

- **Auth routes:** delegated to Better Auth (`/api/auth/*`); the API does not
  implement them, it instruments them.
- **JIT provisioning:** `BetterAuthResolver.resolve()` creates a domain `User` in the
  `users` table the first time it sees a new email, and publishes `UserProvisioned`.
- **Source use case:** `ProvisionUser`.

## Acceptance Criteria

- [ ] Auth routes map to specific telemetry operation names (replacing the previous
      catch-all `Auth`), registered in `createTechnicalTelemetryMiddleware`:

      | Route                           | Operation       |
      | ------------------------------- | --------------- |
      | `POST /api/auth/sign-in/social` | `SignIn`        |
      | `GET /api/auth/callback/google` | `OAuthCallback` |
      | `GET /api/auth/get-session`     | `SessionCheck`  |
      | `POST /api/auth/sign-out`       | `SignOut`       |
      | (other `/api/auth/*`)           | `Auth`          |

- [ ] The first time a domain `User` is created for an email, `UserProvisioned` is
      published and captured to dataset `pineapple_user_domain_events` (binding
      `USER_DOMAIN_TELEMETRY`)
- [ ] Subsequent sign-ins for an existing `User` do **not** re-publish
      `UserProvisioned`

## Telemetry

**Request telemetry:** the auth operation mapping above must exist in the operation
name mapping (see [telemetry.md](../cross-cutting/telemetry.md)). The auth routes
themselves are Better Auth infrastructure; `GET /api/auth/get-session` is not a
product operation but is named `SessionCheck` for observability.

**Domain event — `UserProvisioned`** (dataset: `pineapple_user_domain_events`,
index: `user_id`):

| Field        | Name              | Value                                          |
| ------------ | ----------------- | ---------------------------------------------- |
| `indexes[0]` | —                 | `user_id` (partition key for per-user queries) |
| `blobs[0]`   | `event_type`      | `"UserProvisioned"`                            |
| `blobs[1]`   | `aggregate_type`  | `"User"`                                       |
| `blobs[2]`   | `user_id`         | User UUID                                      |
| `blobs[3]`   | `schema_version`  | `"v1"`                                         |
| `blobs[4]`   | `result`          | `"success"`                                    |
| `blobs[5]`   | `source_use_case` | `"ProvisionUser"`                              |
| `doubles[0]` | `count`           | Always `1`                                     |
| `doubles[1]` | `event_time_ms`   | Event timestamp (ms since epoch)               |

See [telemetry.md](../cross-cutting/telemetry.md) for the envelope, Analytics Engine
constraints, and the Feature Integration Contract for adding domain events.

## Flags

**REVIEW NEEDED — `UserProvisioned` dataset status:** `pineapple_user_domain_events`
/ `USER_DOMAIN_TELEMETRY` is listed as **planned** in
[telemetry.md](../cross-cutting/telemetry.md). Confirm the binding is provisioned
before relying on this event in production dashboards.

## Out of Scope

- The Google OAuth flow internals (owned by Better Auth)
- Email/password sign-in, magic links, other OAuth providers
- The login screen, redirect phase, and error display — see the
  [web counterpart](../../../web/specs/features/sign-in.md)
