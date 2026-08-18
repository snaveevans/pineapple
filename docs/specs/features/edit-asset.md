---
audience: [engineers implementing this feature, product reviewing behavior]
purpose: Let an asset owner correct or update an existing asset's name and details after creation
source: this file
date: 2026-08-17
---

# Edit Asset

**Status:** `in-progress`
**Owner:** [unknown — assign on review]
**Related Specs:** [create-asset.md](./create-asset.md), [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md)

---

## Summary

Once created, an asset's name and details are today permanent — the only way to fix a typo or update information is to delete and recreate it, and deletion isn't supported either. Edit Asset lets the asset's owner update an asset's name and its type-specific fields (make/model/year/VIN for a vehicle, address/nickname for a property, manufacturer/model/serial for equipment) from a form prefilled with its current values. An asset's **type** (vehicle / property / equipment) cannot change after creation — only the fields within it. This is a sibling flow to [Create Asset](./create-asset.md), which explicitly excludes editing.

## User Stories

- As an **asset owner**, I can **edit an existing asset's name and type-specific details** so that **I can correct a mistake or update information without deleting and recreating the asset**
- As an **asset owner**, I can **open the edit form prefilled with the asset's current values** so that **I only have to change what's wrong**
- As an **asset owner**, I **cannot change an asset's type** once it's created, so that **the asset's history and downstream data stay consistent**
- As a **team member with shared access to an asset I don't own**, I **cannot edit it**, so that **the owner keeps control of the asset's core details**
- As a **user**, I can **see clear validation errors** so that **I know exactly which fields need attention before I can save**
- As a **user**, I can **cancel or press Escape** so that **I can back out of an edit without saving**

## Acceptance Criteria

- [x] `S1` An authenticated owner can submit a new name and full type-specific metadata for one of their own assets, and the asset is updated when validation passes
- [x] `S1` A request whose metadata `kind` does not match the asset's current type is rejected (422) — an asset's type cannot change via edit
- [x] `S1` A request from anyone other than the asset's owner is rejected and no changes are applied
- [x] `S1` Editing validates the same rules as creation: name required; vehicle make/model/year required, VIN optional but exactly 17 characters if present; property street/city/state/postal/country required, nickname optional; equipment fields all optional
- [x] `S1` Editing an asset never changes its id, owner, creation time, archived state, or sharing state
- [x] `S1` A successful edit records exactly one domain event capturing what changed, so future durable consumers do not need to re-read the asset (ADR-0010)
- [x] `S1` Submitting an edit identical to the asset's current values succeeds without error
- [ ] `S1` An authenticated owner can reach an edit entry point from the asset's detail page
- [ ] `S1` The edit entry point is not shown to a team member viewing an asset they don't own
- [x] `S1` A non-owner who reaches the edit route directly (not via the entry point) sees an access-denied state instead of the form, whether the API call itself was rejected or it succeeded but the fetched asset's `sharing.isOwner` is false
- [x] `S1` A missing or unloadable asset shows a dedicated state (not found, or a retryable load-failure state) instead of the form
- [x] `S1` The edit form is prefilled with the asset's current name and type-specific field values
- [x] `S1` The asset's type is displayed in the edit form but cannot be changed
- [x] `S1` Field-level validation errors match create-asset's rules and messages, and run before submission
- [x] `S1` Submitting with validation errors shows an error banner and focuses the first invalid field
- [x] `S1` The save action shows a busy state and is disabled while the request is in flight
- [x] `S1` On success, the user returns to the asset's detail page and sees the updated values
- [x] `S1` Cancel and Escape both return to the asset's detail page without saving
- [x] `S1` A 401 response redirects to `/login`, replacing the history entry
- [x] `S1` A non-401 API error shows the banner with the server's message; a field-specific 422 error highlights that field

## Delivery Plan

Single slice — the whole feature (`S1`).

## Edge Cases & Error States

| Scenario                                                        | Expected Behavior                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| All fields cleared before submit                                | Banner + field errors shown; first invalid field focused                                                          |
| Year field: letters entered                                     | "Must be a whole number."                                                                                         |
| Year field: value < 1900 or > current year + 1                  | `"Must be between 1900 and ${currentYear + 1}."`                                                                  |
| VIN: 1–16 characters                                            | `"VIN must be exactly 17 characters (N entered)."`                                                                |
| VIN: exactly 17 characters                                      | Accepted                                                                                                          |
| VIN: empty                                                      | Accepted (optional)                                                                                               |
| Metadata `kind` in the request doesn't match the asset's type   | 422 — asset type is immutable; not reachable from the web form, only a direct API call                            |
| Non-owner submits an edit via the API directly                  | Rejected, no changes applied (403 today per [permissions.md](../cross-cutting/permissions.md); see Flags)         |
| Non-owner viewing a shared asset, on the asset's detail page    | No edit entry point rendered there                                                                                |
| Non-owner reaches the edit route directly (bookmark, typed URL) | The asset loads (they can view it), but the edit form is not rendered — an "Access denied" state is shown instead |
| Asset does not exist / already deleted, on load                 | "Asset not found" state, no form rendered                                                                         |
| Asset load fails for a reason other than 401/403/404            | "Couldn't load asset" state with a retry button                                                                   |
| Edit submitted with no actual changes                           | Saves successfully; no error shown                                                                                |
| API returns 401 (load or save)                                  | Redirect to `/login` (replace)                                                                                    |
| API returns any other error on save                             | Banner with the server's error message                                                                            |
| User navigates away mid-edit                                    | No confirmation prompt; unsaved form state is lost (matches create-asset)                                         |
| Two sessions edit the same asset concurrently                   | Last write wins; no conflict detection (consistent with the rest of the app)                                      |

## Telemetry

**Request telemetry:** `PATCH /api/assets/{id}` maps to a new `EditAsset` operation via `createTechnicalTelemetryMiddleware`. This is a new route — it must be added to the operation name mapping in `technicalTelemetry.ts` and the Operation Name Mapping table in [telemetry.md](../cross-cutting/telemetry.md) before it ships.

**Domain event:** On a successful edit that changes the name and/or metadata, an `AssetEdited` event is published to the event bus, dataset `pineapple_asset_domain_events`, binding `ASSET_DOMAIN_TELEMETRY` — following the `AssetCreated`/`AssetSharedToTeam` pattern. The event carries the new and previous **name** plus **`nameChanged`/`metadataChanged`** flags for durable consumers (e.g. a future History entry showing a rename); it does not carry the metadata object itself — a consumer needing the new metadata value still has to read the asset back. Per the telemetry anti-pattern on PII, **the telemetry data point itself records only ids and boolean change-flags, never the name value**:

**Domain event data point — `AssetEdited`** (dataset: `pineapple_asset_domain_events`, index: `owner_id`):

| Field        | Name               | Value                                       |
| ------------ | ------------------ | ------------------------------------------- |
| `indexes[0]` | —                  | `owner_id`                                  |
| `blobs[0]`   | `event_type`       | `"AssetEdited"`                             |
| `blobs[1]`   | `aggregate_type`   | `"Asset"`                                   |
| `blobs[2]`   | `asset_id`         | Asset UUID                                  |
| `blobs[3]`   | `owner_id`         | Owner UUID                                  |
| `blobs[4]`   | `actor_id`         | UUID of the user who made the edit          |
| `blobs[5]`   | `source_use_case`  | `"EditAsset"`                               |
| `blobs[6]`   | `schema_version`   | `"v1"`                                      |
| `blobs[7]`   | `result`           | `"success"`                                 |
| `doubles[0]` | `count`            | Always `1`                                  |
| `doubles[1]` | `event_time_ms`    | Event timestamp (ms since epoch)            |
| `doubles[2]` | `name_changed`     | `1` if the name changed, else `0`           |
| `doubles[3]` | `metadata_changed` | `1` if any metadata field changed, else `0` |

## Flags

**REVIEW NEEDED — edit entry-point visibility not covered by an automated test:** The edit
button on the asset detail page is gated on `sharing.isOwner`, following the exact pattern
already used by the adjacent (shipped, also untested) share button in
`AppMaintenanceRecords.tsx`. That component has no existing test suite — adding one is a
sizeable, separate undertaking outside this slice's scope. The two boxes above are left
unchecked until either `AppMaintenanceRecords.tsx` gets test coverage or these two assertions
are verified some other way. Owner: engineering.

**REVIEW NEEDED — 403 vs. 404 for non-owner edit attempts:** This spec follows the app's current pattern (403 `ForbiddenError` for wrong-owner access, matching `ShareAsset`/`UnshareAsset`). [Issue #52](https://github.com/snaveevans/pineapple/issues/52) proposes moving the whole app to 404-masking; if that lands first, this endpoint should follow without a spec change. Owner: engineering.

**NOT SPECIFIED — Edits to an archived asset:** Archiving doesn't exist yet ([issue #177](https://github.com/snaveevans/pineapple/issues/177)); this spec doesn't address whether an archived asset can be edited. Revisit when archiving ships.

**NOT SPECIFIED — Maximum name length:** Same open flag as [create-asset.md](./create-asset.md) — no product limit is stated here.

## Out of Scope

- Changing an asset's type (`kind`) after creation
- Bulk editing multiple assets at once
- Archiving or unarchiving an asset (tracked separately in [issue #177](https://github.com/snaveevans/pineapple/issues/177))
- Surfacing edits in the Activity History feed — `AssetEdited` is emitted for future durable consumers per [ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md), but [activity-history.md](./activity-history.md) does not yet track it as an entry type, matching `AssetSharedToTeam`/`AssetUnsharedFromTeam` which are also emitted but not yet tracked
- Optimistic concurrency or conflict detection between simultaneous edits
- A field-level audit trail of exactly what changed (telemetry records only whether name and/or metadata changed, not the values)
- Undo or edit history for a specific asset
