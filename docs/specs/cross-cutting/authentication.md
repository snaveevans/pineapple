---
audience: all contributors
purpose: canonical auth behavior for feature specs
source: this file
date: 2026-06-02
---

# Authentication — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features unless listed in Exceptions

---

## Summary

All application features operate within an authenticated session. Better Auth handles the OAuth flow and session cookie lifecycle; the backend resolves a domain `User` from that session on every protected request. Features must never assume identity — they must receive it from the resolved session context.

## Canonical Behavior

**Backend:**

- Better Auth is mounted at `/api/auth/*` and owns the `user`, `session`, `account`, and `verification` tables.
- All `/api/*` routes outside `/api/auth/*` are protected by the `BetterAuthResolver` middleware registered in `worker.ts`.
- The middleware calls `resolver.resolve()`, which reads the session cookie, validates it, and provisions a domain `User` JIT from the Better Auth record (keyed on email).
- If no valid session exists, the middleware throws `UnauthorizedError` → 401.
- In local development, `DEV_AUTH_EMAIL` in `.dev.vars` bypasses session validation and injects a synthetic user only when `ENVIRONMENT` is exactly `development`.
- If `DEV_AUTH_EMAIL` is present in any other or unspecified environment, authentication fails closed before session resolution or user provisioning. The production deploy also rejects a persisted `DEV_AUTH_EMAIL` Worker secret.

**Frontend:**

- All `fetch` calls include `credentials: "include"` so the session cookie is sent automatically.
- App routes (`/app/*`) are client-rendered and accessible at the page-load level without a session. There is no route guard that prevents a page from rendering before auth is confirmed. Auth is enforced by API responses, not by route access: a protected page renders, makes its first API call, and redirects to login on a 401.
- 401 responses from any API call are treated as a signal to redirect to the login screen. This check belongs in the API client layer, not in individual feature components.

## Feature Integration Contract

Every feature spec must document:

- Whether the feature is accessible unauthenticated (only the routes listed in Exceptions qualify).
- Whether the feature uses the resolved `User.id` as a domain input (e.g., as `requesterId` or `ownerId`).

## Exceptions

| Feature                           | Deviation                     | Reason                                                          |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Google OAuth flow (`/api/auth/*`) | Unauthenticated by definition | Initiates the session; cannot require one                       |
| Marketing / landing page          | Unauthenticated               | Public content, no domain data                                  |
| `GET /health`                     | Unauthenticated               | Operational liveness check; must be reachable without a session |
| `GET /openapi.json`               | Unauthenticated               | Public API spec                                                 |
| `GET /reference`                  | Unauthenticated               | Public API documentation UI                                     |

## Anti-Patterns

- **Checking the session inside a route handler:** Route handlers receive the resolved `User` from middleware context — they must not re-read the session cookie or call Better Auth directly.
- **Hardcoding `DEV_AUTH_EMAIL` values in tests:** Use the test harness auth injection instead. `DEV_AUTH_EMAIL` is a local-dev escape hatch only.
- **Handling 401 inside individual React components:** 401s must be caught at the API client layer and trigger a single centralized redirect. Duplicating this in each feature creates silent divergence.

## Known Issues

- Frontend 401 handling is currently duplicated: `AppAssets.tsx` catches 401 from React Query and navigates to `/login` directly, rather than delegating to a centralized interceptor in the API client. Every new feature that fetches data will need the same fix until this is consolidated.
- Session state in `AuthFlow.tsx` uses a bespoke three-value convention (`undefined` = checking, `null` = logged out, `Session` object = logged in) that is not shared with the rest of the app. See the Loading States spec for the exception rationale.
