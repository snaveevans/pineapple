---
audience: all contributors
purpose: the session/identity handshake shared by API and web
source: this file
date: 2026-06-08
---

# Session Contract — Universal Contract

**Status:** `active`
**Owner:** engineering
**Applies To:** Every `/api/*` route and every web view that calls one

---

## Why this is universal

Authentication has an API half (resolving a domain `User` from a session cookie)
and a web half (sending the cookie and reacting to 401s). Those halves are
documented in their own packages. But the **handshake between them** — what cookie
is sent, what a 401 means, how the session is checked — is a contract both sides
must implement identically. That contract lives here.

- API-side resolution rules:
  [`apps/api/specs/cross-cutting/authentication.md`](../../../apps/api/specs/cross-cutting/authentication.md)
- Web-side cookie + redirect rules:
  [`apps/web/specs/cross-cutting/authentication.md`](../../../apps/web/specs/cross-cutting/authentication.md)

## The Contract

**Session transport:**

- Authentication is carried by the Better Auth **session cookie**. The web client
  includes `credentials: "include"` on every `fetch` so the cookie is always sent.
- Better Auth is mounted at `/api/auth/*` and owns the session lifecycle.

**Protected routes:**

- Every `/api/*` route outside `/api/auth/*` requires a valid session. With no
  valid session, the API responds **401**.
- The list of routes intentionally reachable **without** a session is fixed:

  | Route                               | Why unauthenticated                       |
  | ----------------------------------- | ----------------------------------------- |
  | `/api/auth/*`                       | Initiates the session; cannot require one |
  | `GET /health`                       | Operational liveness check                |
  | `GET /openapi.json`                 | Public API spec                           |
  | `GET /reference`                    | Public API documentation UI               |
  | Marketing / landing page (web, `/`) | Public content, no domain data            |

**401 semantics (the key handshake):**

- A **401 from any API call** is the single signal that the caller is not (or no
  longer) authenticated. The web side treats it as "redirect to `/login`."
- The web side enforces auth via **API responses, not route guards**: a protected
  page may render, make its first API call, and redirect on 401. There is no
  pre-render route guard.

**Session check:**

- `GET /api/auth/get-session` is the canonical way for the web side to read
  current session state without performing an action. Any failure response
  (network, 4xx, 5xx) is treated as "not authenticated"; no error is surfaced.

## Consumers

- **API (resolver / producer of 401):** `BetterAuthResolver` middleware resolves a
  domain `User` JIT from the session and throws `UnauthorizedError` → 401 when
  absent. Local dev may bypass via `DEV_AUTH_EMAIL`. Rules:
  [`apps/api/specs/cross-cutting/authentication.md`](../../../apps/api/specs/cross-cutting/authentication.md).
- **Web (cookie sender / 401 handler):** sends `credentials: "include"`; a
  centralized API-client interceptor maps 401 → redirect to `/login`. Rules:
  [`apps/web/specs/cross-cutting/authentication.md`](../../../apps/web/specs/cross-cutting/authentication.md).

## Anti-Patterns

- **Handling 401 per-component on the web side.** The 401→redirect must live in one
  place (the API client layer), or each feature silently diverges.
- **Adding a protected route without it being 401-guarded by the resolver
  middleware.** New `/api/*` routes are protected by default; only the table above
  is exempt. Exempting a new route requires updating this contract.
