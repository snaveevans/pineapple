---
audience: all contributors
purpose: canonical auth behavior for feature specs
source: this file
date: 2026-09-20
---

# Authentication — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features unless listed in Exceptions

---

## Summary

Application features operate with a verified Pineapple identity. Browser API
requests use a Better Auth session cookie. The MCP protected resource uses a
short-lived, audience-bound OAuth bearer token with the `assets:read` scope.
The backend resolves browser sessions to a domain `User`. MCP verifies the
bearer before protocol handling; application tools must resolve its verified
subject to a domain `User` before accessing data. Features must never assume
identity or accept a caller-selected user ID.

## Canonical Behavior

**Backend:**

- Better Auth is mounted at `/api/auth/*` and owns the `user`, `session`, `account`, and `verification` tables.
- Better Auth also owns the additive OAuth-provider tables used by the private
  MCP connection. It publishes authorization-server metadata and MCP
  protected-resource metadata at the standard `/.well-known/*` paths.
- All `/api/*` routes outside `/api/auth/*` are protected by the `BetterAuthResolver` middleware registered in `worker.ts`.
- The middleware calls `resolver.resolve()`, which reads the session cookie, validates it, and provisions a domain `User` JIT from the Better Auth record (keyed on email).
- If no valid session exists, the middleware throws `UnauthorizedError` → 401.
- In local development, `DEV_AUTH_EMAIL` in `.dev.vars` bypasses session validation and injects a synthetic user only when `ENVIRONMENT` is exactly `development`.
- If `DEV_AUTH_EMAIL` is present in any other or unspecified environment, authentication fails closed before session resolution or user provisioning. The production deploy also rejects a persisted `DEV_AUTH_EMAIL` Worker secret.
- `POST /mcp` accepts only a verified bearer token issued for the canonical
  `/mcp` resource with `assets:read`. A browser session cookie and
  `DEV_AUTH_EMAIL` never authorize MCP.
- Before an MCP application tool accesses Pineapple data, its adapter resolves
  the verified bearer subject to the corresponding domain `User`; transport
  authentication alone does not grant data access.
- MCP authorization uses authorization code with PKCE. Dynamic client
  registration is enabled for private ChatGPT connections. Access tokens
  expire within five minutes; refresh grants can be revoked through the OAuth
  provider.

**Frontend:**

- All `fetch` calls include `credentials: "include"` so the session cookie is sent automatically.
- App routes (`/app/*`) are client-rendered and accessible at the page-load level without a session. There is no route guard that prevents a page from rendering before auth is confirmed. Auth is enforced by API responses, not by route access: a protected page renders, makes its first API call, and redirects to login on a 401.
- 401 responses from any API call are treated as a signal to redirect to the login screen. This check belongs in the API client layer, not in individual feature components.
- A signed MCP authorization request may send the user through `/login` and
  `/oauth/consent`. The Better Auth client preserves the signed continuation
  through Google sign-in; the UI treats it as opaque and never constructs or
  edits OAuth authorization parameters.
- The consent screen identifies the requesting client, explains the narrow
  read-only permission and property-address exclusion, and requires an explicit
  allow or deny decision. It resolves `GET /api/users/me` before allowing access
  so the authenticated Better Auth identity has a Pineapple domain user.

## Feature Integration Contract

Every feature spec must document:

- Whether the feature is accessible unauthenticated (only the routes listed in Exceptions qualify).
- Whether the feature uses the resolved `User.id` as a domain input (e.g., as `requesterId` or `ownerId`).

## Exceptions

| Feature                                     | Deviation                     | Reason                                                                                                                                          |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Google and MCP OAuth flow (`/api/auth/*`)   | Unauthenticated by definition | Initiates sessions and grants; protected sub-routes enforce their own session or client credential requirements                                 |
| MCP discovery (`GET`/`HEAD /.well-known/*`) | Unauthenticated               | Standards metadata contains no user data and must be reachable before authorization                                                             |
| MCP protected resource (`POST /mcp`)        | OAuth bearer token            | Remote agents cannot use browser cookies; token scope and resource audience are verified                                                        |
| MCP consent (`/oauth/consent`)              | Browser session               | The signed authorization continuation plus the user's session authorize the allow/deny decision                                                 |
| Marketing / landing page                    | Unauthenticated               | Public content, no domain data                                                                                                                  |
| `GET /health`                               | Unauthenticated               | Operational readiness probe (deployed version, latest migration, D1 round trip); must be reachable without a session and exposes no domain data |
| `GET /openapi.json`                         | Unauthenticated               | Public API spec                                                                                                                                 |
| `GET /reference`                            | Unauthenticated               | Public API documentation UI                                                                                                                     |
| `POST /api/verify-email`                    | Unauthenticated               | Email-verification confirm authorizes on the token, not a session; the link must work when signed out                                           |

## Anti-Patterns

- **Checking the session inside a route handler:** Route handlers receive the resolved `User` from middleware context — they must not re-read the session cookie or call Better Auth directly.
- **Accepting a cookie or development bypass for MCP:** The MCP trust boundary
  is the bearer token's verified issuer, audience, expiry, and scope.
- **Passing OAuth state through application-owned query fields:** The signed
  continuation is opaque. Use the Better Auth OAuth-provider client plugin so
  it is filtered and forwarded without reinterpretation.
- **Hardcoding `DEV_AUTH_EMAIL` values in tests:** Use the test harness auth injection instead. `DEV_AUTH_EMAIL` is a local-dev escape hatch only.
- **Handling 401 inside individual React components:** 401s must be caught at the API client layer and trigger a single centralized redirect. Duplicating this in each feature creates silent divergence.

## Known Issues

- Frontend 401 handling is currently duplicated: `AppAssets.tsx` catches 401 from React Query and navigates to `/login` directly, rather than delegating to a centralized interceptor in the API client. Every new feature that fetches data will need the same fix until this is consolidated.
- Session state in `AuthFlow.tsx` uses a bespoke three-value convention (`undefined` = checking, `null` = logged out, `Session` object = logged in) that is not shared with the rest of the app. See the Loading States spec for the exception rationale.
