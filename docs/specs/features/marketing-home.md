---
name: marketing-home
description: Work-in-progress public landing page for value proposition, future feature positioning, and CTAs
metadata:
  type: feature
---

# Marketing Home

**Status:** wip
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-03
**Related Specs:** [authentication.md](../cross-cutting/authentication.md)

---

## Summary

The Marketing Home is the work-in-progress public landing page at `/`. Its purpose is to communicate FieldOps' intended value to prospective users, establish what type of user the product is for, and route visitors to either the signup or login flow. The current copy includes future-facing service scheduling and reminder claims that must be revisited before the page is treated as final.

## User Stories

- As a **prospective user**, I can **understand FieldOps' intended direction from the landing page** so that **I can decide whether to sign up**
- As a **prospective user**, I can **click "Get started"** so that **I'm taken directly to the signup form**
- As a **returning user visiting the marketing page**, I can **click "Log in"** so that **I'm taken to the login form**
- As a **curious visitor**, I can **read how the product works** so that **I know what I'm committing to before signing up**

## Acceptance Criteria

- [ ] The page renders at `/` without authentication
- [ ] The page title is "FieldOps — Keep everything you own on schedule"
- [ ] The nav contains: FieldOps logo (links to `/`), "How it works" anchor link (`#how`), "Log in" link (to `/login?mode=login`), "Get started" button (to `/login?mode=signup`)
- [ ] The hero section contains: eyebrow "Built for owner-operators", headline "Never miss a service date again.", lede copy, two CTAs ("Get started" → signup, "See how it works" → `#how`), a hero note ("Free to start · No card needed · Add your first asset in 2 minutes"), and a UI collage
- [ ] The proof strip names tracked or intended asset categories, pending final category review
- [ ] The "How it works" section (id="how") presents a three-step future workflow; schedule and reminder language must remain flagged until those features exist or the copy is revised
- [ ] The closing CTA band contains a "Get started" link (to signup) and a "Log in" link
- [ ] The footer contains: FieldOps logo (links to `/`), "How it works" anchor link, "Log in" link, copyright "© 2026 FieldOps"
- [ ] All "Get started" CTAs link to `/login?mode=signup`
- [ ] All "Log in" CTAs link to `/login` or `/login?mode=login`

## Edge Cases & Error States

| Scenario                      | Expected Behavior                                                        |
| ----------------------------- | ------------------------------------------------------------------------ |
| Authenticated user visits `/` | No redirect; the marketing page is shown (authentication is not checked) |
| "How it works" anchor clicked | Page scrolls to the `#how` section                                       |
| Logo clicked                  | Navigates to `/`                                                         |

## Flags

**REVIEW NEEDED — Steps 2 and 3 describe unbuilt features:** "Set a schedule" and "Get reminded" are described in the how-it-works section, but neither feature exists in the codebase. No service scheduling domain model is implemented, and no reminder/notification infrastructure exists. The marketing copy implies capabilities the product does not yet have.

**NOT SPECIFIED — Terms of Service and Privacy Policy:** The auth page (not this page) links to Terms of Service and Privacy Policy via `href="#"`. The marketing home does not link to these documents either.

**NOT SPECIFIED — "Grounds" in the proof strip:** The strip lists "grounds" as a tracked category alongside vehicles, properties, and equipment. The API only supports vehicle, property, and equipment asset types. "Grounds" / "Lawn" appears in the dashboard prototype data but is not a creatable type.

**NOT SPECIFIED — Telemetry not referenced:** This page makes no API calls and produces no domain events. Client-side frontend telemetry is not yet implemented (listed as an exception in `telemetry.md`). No telemetry applies today, but `telemetry.md` should be referenced so the exception is stated explicitly rather than omitted.

## Out of Scope

- Authentication or session-awareness on this page
- Pricing information
- Feature comparison or tiers
- Blog, changelog, or documentation links
- Analytics or conversion tracking
- A/B testing of CTA copy or layout
