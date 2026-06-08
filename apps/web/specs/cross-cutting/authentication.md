---
audience: web contributors
purpose: how the web app sends credentials and reacts to auth state — frontend half
source: this file
date: 2026-06-08
---

# Authentication (Web) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/web`
**Applies To:** All web views that call the API
**Universal contract:** [session-contract.md](../../../../docs/specs/universal/session-contract.md)

---

## Summary

The web app never decides identity — it sends the session cookie and reacts to what
the API returns. There is no client-side route guard: a protected page renders,
makes its first API call, and redirects to `/login` on a 401. The wire-level
handshake (cookie transport, 401 meaning, unauthenticated route list) is the
[universal session contract](../../../../docs/specs/universal/session-contract.md);
the API-side resolution lives in
[`apps/api/specs/cross-cutting/authentication.md`](../../../api/specs/cross-cutting/authentication.md).
This spec covers the frontend behavior only.

## Canonical Behavior

- All `fetch` calls include `credentials: "include"` so the session cookie is sent
  automatically.
- App routes (`/app/*`) are client-rendered and accessible at the page-load level
  without a session. There is no route guard that prevents a page from rendering
  before auth is confirmed. Auth is enforced by API responses, not by route access:
  a protected page renders, makes its first API call, and redirects to login on a 401.
- 401 responses from any API call are treated as the signal to redirect to the
  login screen. This check belongs in the API client layer, not in individual
  feature components.
- Session state for the auth/landing flow is read via `GET /api/auth/get-session`;
  any failure is treated as "not authenticated" (see the session contract).

## Feature Integration Contract

Every web feature spec must document:

- Whether the view is reachable unauthenticated (only the routes in the
  [session contract](../../../../docs/specs/universal/session-contract.md) qualify;
  on the web side that is the marketing/landing page).
- What the view does on a 401 from its API calls (it should delegate to the
  centralized API-client redirect, not handle 401 inline).

## Exceptions

| Feature                  | Deviation       | Reason                         |
| ------------------------ | --------------- | ------------------------------ |
| Marketing / landing page | Unauthenticated | Public content, no domain data |

## Anti-Patterns

- **Handling 401 inside individual React components:** 401s must be caught at the API
  client layer and trigger a single centralized redirect. Duplicating this in each
  feature creates silent divergence.
- **Adding a route guard that blocks render before auth:** The app intentionally
  renders, then redirects on 401. Do not introduce pre-render auth gating.

## Known Issues

- Frontend 401 handling is currently duplicated: `AppAssets.tsx` catches 401 from
  React Query and navigates to `/login` directly, rather than delegating to a
  centralized interceptor in the API client. Every new feature that fetches data
  will need the same fix until this is consolidated.
- Session state in `AuthFlow.tsx` uses a bespoke three-value convention (`undefined`
  = checking, `null` = logged out, `Session` object = logged in) that is not shared
  with the rest of the app. See [loading-states.md](./loading-states.md) for the
  exception rationale.
