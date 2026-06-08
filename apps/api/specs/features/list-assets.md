---
name: list-assets
description: API capability for listing a user's assets — GET /api/assets, ownership-filtered, non-archived
metadata:
  type: feature
  package: api
---

# List Assets (API)

**Status:** draft
**Owner:** [unknown — assign on review]
**Package:** `apps/api`
**Last Updated:** 2026-06-08
**Web counterpart:** [apps/web/specs/features/asset-library.md](../../../web/specs/features/asset-library.md)
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [permissions.md](../cross-cutting/permissions.md), [error-handling.md](../cross-cutting/error-handling.md), [telemetry.md](../cross-cutting/telemetry.md) · [error-envelope.md](../../../../docs/specs/universal/error-envelope.md), [session-contract.md](../../../../docs/specs/universal/session-contract.md)

---

## Summary

`GET /api/assets` returns every non-archived asset owned by the authenticated user.
Ownership is enforced server-side: the repository query filters by `ownerId`, so a
user can never see another user's assets. The screen that renders this list is the
[web asset-library feature](../../../web/specs/features/asset-library.md); all
presentation (cards, summaries, empty state) is web-side.

> **Contract reminder:** the response asset shape is owned by the Zod response schema
> and `openapi.json`. Do not duplicate the field table here.

## Capability

- **Route:** `GET /api/assets` (protected; requires a session)
- **Use case:** `ListAssets`
- **Operation name:** `ListAssets`

## Acceptance Criteria

- [ ] Returns only the authenticated user's own assets (repository filters by
      `ownerId = requesterId`; see [permissions.md](../cross-cutting/permissions.md))
- [ ] Archived assets are excluded from the collection
- [ ] A request with no valid session returns **401**
- [ ] An empty result is a valid `200` with an empty collection — not an error (the
      empty-state UX is web-side)

## Errors

| Condition        | DomainError / status      |
| ---------------- | ------------------------- |
| No valid session | `UnauthorizedError` → 401 |

All error responses follow the
[universal error envelope](../../../../docs/specs/universal/error-envelope.md).

## Telemetry

**Request telemetry:** `GET /api/assets` maps to the `ListAssets` operation via
`createTechnicalTelemetryMiddleware`. See [telemetry.md](../cross-cutting/telemetry.md)
for the full data point shape.

**Domain events:** None. Read operations are excepted from domain event telemetry
per [telemetry.md](../cross-cutting/telemetry.md).

## Flags

**NOT SPECIFIED — `ListAssets` result count not captured in telemetry:** Request
telemetry confirms `GET /api/assets` was called and succeeded, but does not record
how many assets were returned. Fleet size per user is a core metric for this product
and is not currently observable from telemetry.

**NOT SPECIFIED — Pagination:** The endpoint returns the full collection. No
pagination, limit, or cursor is defined. Acceptable at current fleet sizes; revisit
before fleets grow large.

## Out of Scope

- Filtering, searching, or sorting on the server (the web toolbar controls are
  disabled/stubbed)
- A single-asset read endpoint (`GET /api/assets/{id}` exists in the operation
  mapping but has no feature spec yet)
- Presentation: cards, summary formatting, thumbnails, empty state — see the
  [web counterpart](../../../web/specs/features/asset-library.md)
