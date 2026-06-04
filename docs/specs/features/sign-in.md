---
name: sign-in
description: Google OAuth login and signup flow — initiating the redirect, loading/confirmation state, mode distinction, and sign out
metadata:
  type: feature
---

# Sign In

**Status:** review
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-04
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [telemetry.md](../cross-cutting/telemetry.md)

---

## Summary

The Sign In feature lets users authenticate with FieldOps via Google OAuth. It lives at `/login` and covers the entire auth lifecycle on that page: arriving in login or signup mode, initiating the Google OAuth redirect, the in-progress state while waiting for Google, automatic navigation to the dashboard on success, and an error message when Google's callback returns a failure.

## User Stories

- As a **new visitor**, I can **create an account with Google** so that **I can start tracking assets without creating a separate password**
- As a **returning user**, I can **log back in with Google** so that **I can access my fleet**
- As a **marketing CTA visitor**, I can **arrive directly in signup vs. login mode** so that **the page matches my intent**

## Acceptance Criteria

- [ ] Visiting `/login` with no session and no query param shows the login form ("Welcome back" / "Log in to FieldOps")
- [ ] Visiting `/login?mode=signup` shows the signup form ("Get started" / "Create your account")
- [ ] The login and signup forms share the same "Continue with Google" button; clicking switches to the redirect phase
- [ ] The redirect phase shows a spinner, Google G mark, and "Connecting to Google…" message with a Cancel button
- [ ] Clicking Cancel in the redirect phase returns to the form
- [ ] After a successful OAuth callback, the app automatically navigates to `/app` (the dashboard)
- [ ] Visiting `/login` with `?error=google` in the query string shows a generic error message on the form [REVIEW NEEDED: exact error message text and visual treatment pending design]
- [ ] The login screen includes a mode-switch link: login → "New to FieldOps? Create an account" (switches to signup mode); signup → "Already have an account? Log in" (switches to login mode)
- [ ] The brand panel displays three value propositions and a product preview collage
- [ ] An informational notice states that email & password sign-in is "coming soon" and Google is the current method

## Edge Cases & Error States

| Scenario                                                                    | Expected Behavior                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/auth/sign-in/social` returns a non-OK status                     | Error is caught; phase returns to `form`                               |
| `POST /api/auth/sign-in/social` returns OK but no `url` field               | Error is caught; phase returns to `form`                               |
| `GET /api/auth/get-session` fails on load                                   | Session treated as `null` (logged out); login form shown               |
| User already has a valid session when visiting `/login`                     | Navigates to `/app` after session check resolves                       |
| OAuth callback includes `?error=google`                                     | Generic error message shown on the form; phase set to `form`           |
| Google OAuth fails during the window redirect (network error before return) | User is stuck at Google's error page; they must navigate back manually |

## Telemetry

**Request telemetry:** Auth routes map to specific operation names. The previous catch-all `Auth` operation is replaced with the following:

| Route                           | Operation       |
| ------------------------------- | --------------- |
| `POST /api/auth/sign-in/social` | `SignIn`        |
| `GET /api/auth/callback/google` | `OAuthCallback` |
| `GET /api/auth/get-session`     | `SessionCheck`  |
| `POST /api/auth/sign-out`       | `SignOut`       |
| (other `/api/auth/*`)           | `Auth`          |

These entries must be added to the operation name mapping in `createTechnicalTelemetryMiddleware`. See [telemetry.md](../cross-cutting/telemetry.md) for the full request data point shape and Feature Integration Contract.

**Domain events:** The `UserProvisioned` event is published when `BetterAuthResolver.resolve()` creates a new domain `User` for the first time. Dataset: `pineapple_user_domain_events`. Binding: `USER_DOMAIN_TELEMETRY`.

**`UserProvisioned` data point** (index: `user_id`):

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

## Flags

**REVIEW NEEDED — silent OAuth initiation error:** When `startGoogleSignIn()` throws (e.g. bad network, non-OK status), the phase resets to `form` but the error is only logged to the browser console. No in-page error message is shown to the user.

**AMBIGUOUS — session check flicker:** During the initial session check, the login form is shown. If the user has an active session, the page navigates to `/app` after the check resolves — the form is briefly visible before the redirect fires. No explicit loading state exists for the session check phase.

**NOT SPECIFIED — Terms of Service / Privacy Policy:** The auth card links to Terms of Service and Privacy Policy via `href="#"`. No actual documents exist at those URLs.

## Out of Scope

- Email and password sign-in (the UI notes it as "coming soon"; not supported)
- Magic link or other OAuth providers
- Password reset flow
- Session expiry handling within the app (handled by API middleware redirecting 401s to login, not this page)
- Account deletion or deactivation
- Signed-in confirmation screen (replaced by auto-redirect to `/app`)
- User initialization / onboarding page for new users (future update)
- Sign-out from `/login` (confirmation screen removed; sign-out is handled within the app)
