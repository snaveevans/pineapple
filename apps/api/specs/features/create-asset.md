---
name: create-asset
description: API capability for creating an asset — POST /api/assets, dual-layer validation, ownership assignment, and the AssetCreated event
metadata:
  type: feature
  package: api
---

# Create Asset (API)

**Status:** draft
**Owner:** [unknown — assign on review]
**Package:** `apps/api`
**Last Updated:** 2026-06-08
**Web counterpart:** [apps/web/specs/features/create-asset.md](../../../web/specs/features/create-asset.md)
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [permissions.md](../cross-cutting/permissions.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [telemetry.md](../cross-cutting/telemetry.md) · [error-envelope.md](../../../../docs/specs/universal/error-envelope.md), [session-contract.md](../../../../docs/specs/universal/session-contract.md)

---

## Summary

`POST /api/assets` creates a new asset owned by the authenticated user. It accepts
one of three asset types — vehicle, property, equipment — each with a different
field set, validates input at the HTTP edge (Zod) and the domain boundary,
persists the asset with `ownerId` derived from the session, and publishes an
`AssetCreated` domain event. The UX that drives this endpoint is the
[web create-asset feature](../../../web/specs/features/create-asset.md).

> **Contract reminder:** field names, types, required/optional, and string
> constraints are owned by the Zod schema and the generated `openapi.json`, not this
> spec. The criteria below describe behavior and rules the spec cannot derive from
> the schema; never duplicate the schema field table here.

## Capability

- **Route:** `POST /api/assets` (protected; requires a session per the
  [session contract](../../../../docs/specs/universal/session-contract.md))
- **Schema:** the request body Zod schema in `apps/api/src/api/schemas/`
- **Use case:** `CreateAsset` (returns `Result<Asset, DomainError>`)
- **Operation name:** `CreateAsset`

## Acceptance Criteria

- [ ] A valid request creates an asset owned by the authenticated `User` and returns
      the created asset
- [ ] `ownerId` is derived from the session `requesterId`, never accepted from the
      request body (see [permissions.md](../cross-cutting/permissions.md))
- [ ] All asset types require an **Asset name**
- [ ] **Vehicle** requires make, model, year; VIN optional (17 chars when present)
- [ ] **Property** requires street, city, state, postal, country; nickname optional
- [ ] **Equipment**: manufacturer, model number, serial number all optional
- [ ] Year must be a whole number between 1900 and current year + 1; the upper bound
      uses `.refine()` (not `.max()`) per [validation.md](../cross-cutting/validation.md)
- [ ] VIN, if present, must be exactly 17 characters; a non-empty, non-17 VIN is
      rejected
- [ ] Validation failures return **422** in the
      [error envelope](../../../../docs/specs/universal/error-envelope.md), with
      `field` set to the offending dot-notation path (e.g. `metadata.vin`) where the
      failure is field-specific
- [ ] A request with no valid session returns **401** (handled by the resolver
      middleware, not this route)

## Errors

| Condition                            | DomainError / status      | `field` on wire                         |
| ------------------------------------ | ------------------------- | --------------------------------------- |
| Zod schema failure                   | 422 (via `defaultHook`)   | offending field path                    |
| Domain rule failure (e.g. VIN, year) | `ValidationError` → 422   | dot-notation path (e.g. `metadata.vin`) |
| No valid session                     | `UnauthorizedError` → 401 | —                                       |

All error responses follow the
[universal error envelope](../../../../docs/specs/universal/error-envelope.md).

## Telemetry

**Request telemetry:** `POST /api/assets` maps to the `CreateAsset` operation via
`createTechnicalTelemetryMiddleware`. See [telemetry.md](../cross-cutting/telemetry.md)
for the full data point shape.

**Domain event:** On successful creation, `AssetCreated` is published to the event
bus and captured by `AssetCreatedTelemetryHandler` (dataset:
`pineapple_asset_domain_events`, binding: `ASSET_DOMAIN_TELEMETRY`). The full ordered
blobs/doubles contract is defined in [telemetry.md](../cross-cutting/telemetry.md).

## Flags

**NOT SPECIFIED — Maximum name length:** The product limit for asset names is not
stated; server validation may enforce a limit. Decide and encode it in the Zod
schema.

**REVIEW NEEDED — State and country enumerations:** The web form constrains state to
OR/WA/CA/ID/NV/AZ and country to US/Canada/Mexico. Whether the **API** enforces the
same enumerations (vs accepting any string) is not specified here; if the API is
permissive, the constraint is web-only and can be bypassed.

## Out of Scope

- Editing an existing asset
- Bulk import of assets
- Duplicate detection
- Archiving or deleting an asset
- Service schedule creation
- The form UX, inline validation, and post-save navigation — see the
  [web counterpart](../../../web/specs/features/create-asset.md)
