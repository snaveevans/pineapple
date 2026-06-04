---
name: marketing-home
description: Work-in-progress public landing page for value proposition, future feature positioning, and CTAs; adapts auth CTAs based on session state
metadata:
  type: feature
---

# Marketing Home

**Status:** active
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-04
**Related Specs:** [authentication.md](../cross-cutting/authentication.md)

---

## Summary

The Marketing Home is the work-in-progress public landing page at `/`. Its purpose is to communicate FieldOps' intended value to prospective users, establish what type of user the product is for, and route visitors to either the signup or login flow. The page is publicly accessible regardless of session state, but on load it checks the current session: if the visitor is already logged in, every CTA that would navigate to the login screen is replaced with a single "Go to App" button linking to `/app`. The current copy includes future-facing service scheduling and reminder claims that must be revisited before the page is treated as final.

## User Stories

- As a **prospective user**, I can **understand FieldOps' intended direction from the landing page** so that **I can decide whether to sign up**
- As a **prospective user**, I can **click "Get started"** so that **I'm taken directly to the signup form**
- As a **returning user visiting the marketing page**, I can **click "Log in"** so that **I'm taken to the login form**
- As a **curious visitor**, I can **read how the product works** so that **I know what I'm committing to before signing up**
- As an **already-logged-in user visiting the marketing page**, I can **click "Go to App"** so that **I can navigate directly to the app without going through the login screen again**

## Acceptance Criteria

### Unauthenticated state (default / loading)

- [ ] The page renders at `/` without authentication
- [ ] The page title is "FieldOps — Keep everything you own on schedule"
- [ ] While the session check is in flight, the page displays the unauthenticated button set (described below); this prevents layout shift in the common case where the visitor is not logged in
- [ ] The nav contains: FieldOps logo (links to `/`), "How it works" anchor link (`#how`), "Log in" link (to `/login?mode=login`), "Get started" button (to `/login?mode=signup`)
- [ ] The hero section contains: eyebrow "Built for owner-operators", headline "Never miss a service date again.", lede copy, two CTAs ("Get started" → signup, "See how it works" → `#how`), a hero note ("Free to start · No card needed · Add your first asset in 2 minutes"), and a UI collage
- [ ] The proof strip names tracked or intended asset categories, pending final category review
- [ ] The "How it works" section (id="how") presents a three-step future workflow; schedule and reminder language must remain flagged until those features exist or the copy is revised
- [ ] The closing CTA band contains a "Get started" link (to signup) and a "Log in" link
- [ ] The footer contains: FieldOps logo (links to `/`), "How it works" anchor link, "Log in" link, copyright "© 2026 FieldOps"
- [ ] All "Get started" CTAs link to `/login?mode=signup`
- [ ] All "Log in" CTAs link to `/login` or `/login?mode=login`

### Session check

- [ ] On page load, the page calls `GET /api/auth/get-session` (Better Auth session endpoint) to determine the current session state
- [ ] Any failure response (network error, 4xx, 5xx) is treated as "not authenticated"; the unauthenticated button set remains and no error is surfaced to the user

### Authenticated state

When `GET /api/auth/get-session` resolves with a valid session, every button or link that would navigate to the login screen is replaced with a "Go to App" button linking to `/app`. Specifically:

- [ ] The nav's "Log in" link and "Get started" button are replaced by a single "Go to App" button (to `/app`)
- [ ] The hero's "Get started" CTA is replaced by a "Go to App" button (to `/app`); "See how it works" (→ `#how`) remains unchanged
- [ ] The closing CTA band's "Get started" and "Log in" are replaced by a single "Go to App" button (to `/app`)
- [ ] The footer's "Log in" link is removed; no replacement is shown in the footer

## Edge Cases & Error States

| Scenario                                   | Expected Behavior                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Authenticated user visits `/`              | Marketing page shown; session check resolves; all login-destined CTAs swap to "Go to App" (→ `/app`)                |
| Session check in flight                    | Unauthenticated button set is displayed; no spinner or placeholder is shown                                         |
| Session check fails (network error or 5xx) | Unauthenticated button set is retained; no error message is shown to the user                                       |
| Unauthenticated user visits `/`            | Session check resolves as no session; default unauthenticated button set is displayed (no visible change from load) |
| "How it works" anchor clicked              | Page scrolls to the `#how` section                                                                                  |
| Logo clicked                               | Navigates to `/`                                                                                                    |

## Telemetry

**Request telemetry:** `GET /api/auth/get-session` is called on page load to determine session state. This is a Better Auth infrastructure endpoint; it is not a product operation and does not need an entry in `technicalTelemetry.ts`.

**Domain events:** None — this feature is frontend-only and read-only. Client-side frontend telemetry is not yet implemented (listed as an exception in `telemetry.md`).

## Flags

**REVIEW NEEDED — Steps 2 and 3 describe unbuilt features:** "Set a schedule" and "Get reminded" are described in the how-it-works section, but neither feature exists in the codebase. No service scheduling domain model is implemented, and no reminder/notification infrastructure exists. The marketing copy implies capabilities the product does not yet have.

**NOT SPECIFIED — Terms of Service and Privacy Policy:** The auth page (not this page) links to Terms of Service and Privacy Policy via `href="#"`. The marketing home does not link to these documents either.

**NOT SPECIFIED — "Grounds" in the proof strip:** The strip lists "grounds" as a tracked category alongside vehicles, properties, and equipment. The API only supports vehicle, property, and equipment asset types. "Grounds" / "Lawn" appears in the dashboard prototype data but is not a creatable type.

## Out of Scope

- Redirecting authenticated users away from the marketing page (they may intentionally visit it)
- Pricing information
- Feature comparison or tiers
- Blog, changelog, or documentation links
- Analytics or conversion tracking
- A/B testing of CTA copy or layout
