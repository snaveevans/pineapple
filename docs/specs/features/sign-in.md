---
name: sign-in
description: Google OAuth login and signup flow — initiating the redirect, loading/confirmation state, mode distinction, and sign out
metadata:
  type: feature
---

# Sign In

**Status:** draft
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-03
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [telemetry.md](../cross-cutting/telemetry.md)

---

## Summary

The Sign In feature lets users authenticate with FieldOps via Google OAuth. It lives at `/login` and covers the entire auth lifecycle on that page: arriving in login or signup mode, initiating the Google OAuth redirect, the in-progress state while waiting for Google, the post-OAuth signed-in confirmation, and signing out.

## User Stories

- As a **new visitor**, I can **create an account with Google** so that **I can start tracking assets without creating a separate password**
- As a **returning user**, I can **log back in with Google** so that **I can access my fleet**
- As a **signed-in user visiting `/login`**, I can **see that I am already signed in** and **navigate to the app or sign out**
- As a **marketing CTA visitor**, I can **arrive directly in signup vs. login mode** so that **the page matches my intent**

## Acceptance Criteria

- [ ] Visiting `/login` with no session and no query param shows the login form ("Welcome back" / "Log in to FieldOps")
- [ ] Visiting `/login?mode=signup` shows the signup form ("Get started" / "Create your account")
- [ ] The login and signup forms share the same "Continue with Google" button; clicking switches to the redirect phase
- [ ] The redirect phase shows a spinner, Google G mark, and "Connecting to Google…" message with a Cancel button
- [ ] Clicking Cancel in the redirect phase returns to the form
- [ ] After a successful OAuth callback, `/login` detects the session and shows the signed-in confirmation with user name/email and a "Go to FieldOps" link
- [ ] The "Go to FieldOps" link navigates to `/app`
- [ ] Clicking "Sign out" on the confirmation screen clears the session and performs a full-page reload to `/`
- [ ] The login screen includes a mode-switch link: login → "New to FieldOps? Create an account" (switches to signup mode); signup → "Already have an account? Log in" (switches to login mode)
- [ ] The brand panel displays three value propositions and a product preview collage
- [ ] An informational notice states that email & password sign-in is "coming soon" and Google is the current method

## Edge Cases & Error States

| Scenario                                                                    | Expected Behavior                                                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in/social` returns a non-OK status                     | Error is caught; phase returns to `form`                                                                                                                    |
| `POST /api/auth/sign-in/social` returns OK but no `url` field               | Error is caught; phase returns to `form`                                                                                                                    |
| `GET /api/auth/get-session` fails on load                                   | Session treated as `null` (logged out); login form shown                                                                                                    |
| User already has a valid session when visiting `/login`                     | Signed-in confirmation shown immediately                                                                                                                    |
| OAuth callback includes `?error=google`                                     | [REVIEW NEEDED: `errorCallbackURL` is set to `/login?error=google` but no code renders an error state for this query param — the error is silently ignored] |
| Google OAuth fails during the window redirect (network error before return) | User is stuck at Google's error page; they must navigate back manually                                                                                      |
| Sign-out request fails                                                      | Sign-out fetch uses `.finally()` — the page reloads to `/` regardless of whether the sign-out succeeded                                                     |

## Telemetry

**Request telemetry:** All `/api/auth/*` requests map to the `Auth` operation via `createTechnicalTelemetryMiddleware`. See [telemetry.md](../cross-cutting/telemetry.md) for the full data point shape.

**Domain events:** None. The sign-in flow does not produce domain events.

## Flags

**REVIEW NEEDED — silent OAuth initiation error:** When `startGoogleSignIn()` throws (e.g. bad network, non-OK status), the phase resets to `form` but the error is only logged to the browser console. No in-page error message is shown to the user.

**REVIEW NEEDED — `?error=google` unhandled:** Google can redirect back to `/login?error=google` on failure, but the page does not display an error for this state.

**AMBIGUOUS — session check flicker:** During the initial session check, the form is shown. If a session already exists, the page switches from the form to the signed-in confirmation after the check resolves. There is no explicit loading state for the session check phase.

**NOT SPECIFIED — Terms of Service / Privacy Policy:** The auth card links to Terms of Service and Privacy Policy via `href="#"`. No actual documents exist at those URLs.

**REVIEW NEEDED — Sign-out failure behavior is intentionally unresolved:** Sign-out uses `.finally()` to reload to `/` regardless of whether the server-side sign-out succeeded. If the sign-out request fails, the session may still be active while the user is redirected to the marketing page. The spec describes what the code does but does not confirm whether this is a deliberate trade-off or an oversight.

**NOT SPECIFIED — No `UserProvisioned` event:** `BetterAuthResolver.resolve()` silently creates a new domain `User` when one does not exist, but no domain event is published. From telemetry, a first-time sign-up is indistinguishable from a returning login — both appear as an `Auth` request. New user count is not currently observable.

**NOT SPECIFIED — `Auth` operation too coarse to distinguish sub-flows:** All `/api/auth/*` routes collapse into a single `Auth` operation in request telemetry. Sign-in initiation, OAuth callback, session check, and sign-out are indistinguishable by operation name. Sign-in rate, sign-out rate, and session-check frequency cannot be measured independently.

## Out of Scope

- Email and password sign-in (the UI notes it as "coming soon"; not supported)
- Magic link or other OAuth providers
- Password reset flow
- Session expiry handling within the app (handled by API middleware redirecting 401s to login, not this page)
- Account deletion or deactivation
