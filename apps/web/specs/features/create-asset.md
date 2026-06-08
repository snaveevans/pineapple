---
name: create-asset
description: Create-asset form UX — type selection, type-specific fields, pre-submit validation, save states, and post-save navigation
metadata:
  type: feature
  package: web
---

# Create Asset (Web)

**Status:** draft
**Owner:** [unknown — assign on review]
**Package:** `apps/web`
**Last Updated:** 2026-06-08
**API counterpart:** [apps/api/specs/features/create-asset.md](../../../api/specs/features/create-asset.md)
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md) · [error-envelope.md](../../../../docs/specs/universal/error-envelope.md)

---

## Summary

The Create Asset form lets an authenticated user add a new asset to their fleet. It
lives at `/app/assets/new` and supports three asset types — vehicle, property, and
equipment — each with a different set of fields. Pre-submit validation runs as a UX
convenience (the authoritative rules and the `POST /api/assets` capability live in
the [API counterpart](../../../api/specs/features/create-asset.md)). On success, the
user is sent back to the asset library.

## User Stories

- As an **authenticated user**, I can **choose an asset type and fill in the relevant
  details** so that **my new asset is saved and appears in my library**
- As a **user**, I can **see clear validation errors** so that **I know exactly which
  fields need attention before I can save**
- As a **user**, I can **cancel or press Escape** so that **I can exit the form without
  creating an asset**

## Acceptance Criteria

- [ ] The page renders a type picker with three options: Vehicle (car icon), Property
      (home icon), Equipment (wrench icon)
- [ ] Selecting a type clears any existing validation errors and shows the
      type-specific field section
- [ ] All types require an **Asset name** field
- [ ] **Vehicle** fields: Make (req), Model (req), Year (req), VIN (opt, 17 chars)
- [ ] **Property** fields: Street (req), City (req), State (req, dropdown), Postal
      (req), Country (req, dropdown), Nickname (opt)
- [ ] **Equipment** fields: Manufacturer (opt), Model number (opt), Serial number
      (opt)
- [ ] Pre-submit validation mirrors the API rules (year 1900–currentYear+1; VIN
      exactly 17 chars when present) as a convenience; the backend re-validates
- [ ] Submitting with validation errors shows an error banner ("N field(s) need
      attention") and focuses the first invalid field
- [ ] The error count also appears in the sticky footer
- [ ] Save button shows "Saving…" and is disabled while save is in flight (mutation
      `isPending`; see [loading-states.md](../cross-cutting/loading-states.md))
- [ ] On success, the user is navigated to `/app/assets` and the newly created asset
      appears in the asset library
- [ ] Pressing Escape navigates to `/app/assets`
- [ ] Clicking Cancel navigates to `/app/assets`
- [ ] A **401** response redirects to `/login` (replacing history entry), delegated to
      the API client per [authentication.md](../cross-cutting/authentication.md)
- [ ] A non-401 API error shows the banner with "Asset could not be saved" and the
      server message; if the API returns a `field` (per the
      [error envelope](../../../../docs/specs/universal/error-envelope.md)), the error
      is mapped to that form field via `toAssetFormError()`

## Edge Cases & Error States

| Scenario                                       | Expected Behavior                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| All fields empty on first save                 | Banner + field errors shown; first invalid field focused                                     |
| Year field: letters entered                    | "Must be a whole number."                                                                    |
| Year field: value < 1900 or > current year + 1 | `"Must be between 1900 and ${currentYear + 1}."`                                             |
| VIN: 1–16 chars                                | `"VIN must be exactly 17 characters (N entered)."`                                           |
| VIN: exactly 17 chars                          | Accepted                                                                                     |
| VIN: empty                                     | Accepted (optional)                                                                          |
| Switching asset type                           | Clears all validation errors and banner                                                      |
| Editing a field that has an error              | The per-field error for that field is cleared immediately on change; call `mutation.reset()` |
| API returns 422 with a known field path        | Error message pinned to that form field                                                      |
| API returns 422 with an unknown field path     | Banner shown, no field highlighted                                                           |
| API returns 401                                | Redirect to `/login` (replace)                                                               |
| API returns any other error                    | Banner with error message                                                                    |
| User navigates away mid-form                   | No confirmation prompt; form state is lost                                                   |

## Flags

**REVIEW NEEDED — State dropdown limited to western US:** The state field is a
dropdown with only OR, WA, CA, ID, NV, AZ. This may be intentional for the target user
base or an early-stage placeholder. There is no free-text fallback for users in other
states. (Whether the API enforces this enumeration is flagged in the
[API counterpart](../../../api/specs/features/create-asset.md).)

**REVIEW NEEDED — Country dropdown limited to three countries:** Country is a dropdown
of "United States", "Canada", "Mexico". No free-text fallback.

**NOT SPECIFIED — Form state on navigation away:** There is no unsaved-changes warning
when the user navigates away or presses Escape with data in the form.

**NOT SPECIFIED — Post-save asset library refresh strategy:** On success the user is
navigated to `/app/assets` and the new asset is expected to appear. It is not specified
whether this is achieved via optimistic insertion, a full re-fetch, or cache
invalidation (the canonical mutation pattern is to invalidate the relevant query
cache; see [loading-states.md](../cross-cutting/loading-states.md)).

**NOT SPECIFIED — Year field input type:** The validation rules imply numeric input,
but the field type (number input vs. text input with coercion) is not stated. The
choice affects mobile keyboard presentation and how letters-in-year errors are
surfaced.

## Out of Scope

- The `POST /api/assets` endpoint, server-side validation, ownership assignment, and
  telemetry — see the [API counterpart](../../../api/specs/features/create-asset.md)
- Editing an existing asset
- Bulk import of assets
- Duplicate detection
- Archiving or deleting an asset during creation
- Service schedule creation
