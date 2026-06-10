---
name: maintenance-record
description: Historical maintenance log entries tied to assets, including creation, asset-level history, validation, ownership, and telemetry
metadata:
  type: feature
---

# Maintenance Record

**Status:** draft
**Owner:** [unknown - assign on review]
**Last Updated:** 2026-06-04
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [dashboard.md](./dashboard.md)

---

## Summary

The Maintenance Record feature lets an authenticated user create dated maintenance log entries for an asset and view that asset's maintenance history. Records capture what was done, when it was done, and optional notes so the user can later answer questions like "when did I last change this?" without introducing service schedules, reminders, structured maintenance tasks, or component analytics.

## User Stories

- As an **authenticated owner-operator**, I can **record completed maintenance on one of my assets** so that **I have a durable history of work I performed**
- As **DIYer Dale**, I can **record a home air-filter change** so that **I can later see when I last changed it**
- As **DIYer Dale**, I can **record a propane tank replacement on my toy hauler trailer** so that **I can later compare replacement history manually**
- As **DIYer Dale**, I can **record a sprinkler replacement with location details in notes** so that **I can later spot repeated problems by reviewing the history**
- As **DIYer Dale**, I can **record when I added water softener pellets** so that **I can later see my replenishment history**
- As an **authenticated owner-operator**, I can **view maintenance records for an asset in reverse chronological order** so that **the most recent work is easiest to find**
- As a **user entering a maintenance record**, I can **see clear validation errors** so that **I know exactly what must be corrected before saving**

## Acceptance Criteria

- [ ] A maintenance record is always tied to an existing asset owned by the authenticated user
- [ ] The API never accepts `ownerId` in the request body; ownership is derived from the authenticated session
- [ ] The create use case checks that the target asset exists and belongs to the authenticated user before creating the record
- [ ] The list use case returns only records for an asset owned by the authenticated user
- [ ] `POST /api/assets/{assetId}/maintenance-records` accepts `{ title, performedAt, notes? }` and returns the full created maintenance record with status 201
- [ ] `GET /api/assets/{assetId}/maintenance-records` returns `{ maintenanceRecords: [...] }` with status 200
- [ ] Maintenance record responses contain `id`, `assetId`, `title`, `performedAt`, nullable `notes`, and `createdAt`; `ownerId` is never exposed
- [ ] The user can start maintenance record creation from an asset detail page
- [ ] The maintenance record form requires a **Title** field describing the work performed
- [ ] Title is limited to 100 characters
- [ ] The maintenance record form requires a **Performed date** field
- [ ] The maintenance record form includes optional **Notes** for free-form details such as component location, observed condition, cost, vendor, quantity, or replacement context
- [ ] Notes are limited to 1000 characters
- [ ] The performed date must be today or earlier; future dates are rejected with a field-level validation error
- [ ] Performed date is treated as date-only data in `YYYY-MM-DD` format, not as a user-local timestamp
- [ ] The API uses the current UTC calendar date as the authoritative definition of today
- [ ] An archived asset's maintenance history remains readable, but creating a new record for it returns 409
- [ ] Submitting with missing or invalid required fields shows an error banner and field-level errors
- [ ] Editing a field that has an error clears that field's error immediately
- [ ] Save button shows "Saving..." and is disabled while save is in flight
- [ ] On successful save, the asset's maintenance history includes the newly created record
- [ ] On successful save, the user remains in or returns to the asset context where the record can be seen
- [ ] The asset maintenance history shows records newest first by performed date
- [ ] If two records have the same performed date, the most recently created record appears first
- [ ] An asset with no maintenance records shows an empty state with an action to add the first record
- [ ] A 401 response from the API redirects to `/login` through the API client layer
- [ ] A 403 response is shown as an access-denied error if the asset exists but belongs to another user
- [ ] A 404 response is shown as a not-found error if the asset does not exist
- [ ] A non-401 API error shows a banner with the server error message; if the API identifies a specific field, the error is mapped to that field
- [ ] Creating a maintenance record publishes a `MaintenanceRecordCreated` domain event

## Validation & Ownership

**Authentication:** This feature is available only to authenticated users. API requests use the resolved `User.id` as `requesterId`.

**Permissions:** Maintenance records are owned through the asset they belong to. A user can create and list maintenance records only for assets they own. The client cannot supply `ownerId`.

**HTTP validation:** Inputs are validated at the Zod HTTP edge in `apps/api/src/api/schemas/maintenanceRecordSchemas.ts` and drive the generated OpenAPI contract. The schema requires `title` and `performedAt`, allows optional `notes`, enforces title length <= 100 characters, enforces notes length <= 1000 characters, validates `assetId` as a UUID, and rejects malformed calendar dates. The domain performs the authoritative current-UTC-date comparison.

**Domain validation:** Domain construction trims title and notes, converts blank notes to `null`, and preserves these invariants: a maintenance record has an asset ID, owner ID derived from the session context, non-empty title of 100 characters or fewer, date-only performed date of today or earlier, nullable notes of 1000 characters or fewer, and a UTC creation timestamp.

**Date-only mitigation:** Until a cross-cutting time spec exists, this feature treats `performedAt` as a timezone-free calendar date string in `YYYY-MM-DD` format across the UI, API, domain, and D1 persistence. The implementation should compare dates lexicographically against today's `YYYY-MM-DD` value and must not parse `performedAt` through `Date` for validation, storage, or display. The stored maintenance date is not "in UTC"; it is a date-only value with no time zone. Generated timestamps such as `createdAt`, domain event time, and request telemetry time are UTC instants. Event telemetry may convert `performedAt` to UTC midnight only at the telemetry boundary because Analytics Engine doubles require a number.

**Field errors:** Validation errors map back to `title`, `performedAt`, and `notes` when the backend includes a known `field` value.

## Edge Cases & Error States

| Scenario                                            | Expected Behavior                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| Asset has no maintenance records                    | Empty state shown with an add action                                        |
| Title is empty                                      | Save blocked; title field shows a required-field error                      |
| Title is over 100 characters                        | Save blocked; title field shows a max-length error                          |
| Performed date is empty                             | Save blocked; performed date field shows a required-field error             |
| Performed date is in the future                     | Save blocked; performed date field shows a "must be today or earlier" error |
| Notes is empty or whitespace-only                   | Accepted and normalized to `null`                                           |
| Notes is over 1000 characters                       | Save blocked; notes field shows a max-length error                          |
| Notes contains component details                    | Accepted as free text; no structured component/location fields are created  |
| Asset is archived and history is requested          | Existing maintenance history is returned                                    |
| Asset is archived and record creation is attempted  | Creation rejected with 409                                                  |
| User submits and the API returns 422 with a field   | Banner shown and the server message is pinned to the matching form field    |
| User submits and the API returns 422 without field  | Banner shown; no field highlighted                                          |
| User submits and the API returns 401                | Redirect to `/login` (replace history entry)                                |
| User submits or views another user's asset          | 403 access-denied treatment                                                 |
| User submits or views a missing asset               | 404 not-found treatment                                                     |
| Maintenance history request fails                   | Error state shown with retry action                                         |
| Maintenance history request is pending              | Loading state shown; history area is not blank                              |
| User edits a field after a failed submit            | Field error clears and mutation error state resets                          |
| User records two entries on the same performed date | Both records are shown; newest created entry sorts first within that date   |

## Telemetry

**Request telemetry:** `POST /api/assets/{assetId}/maintenance-records` maps to the `CreateMaintenanceRecord` operation via `createTechnicalTelemetryMiddleware`. `GET /api/assets/{assetId}/maintenance-records` maps to the `ListMaintenanceRecords` operation. Both route patterns must be added to the operation name mapping in `technicalTelemetry.ts`; see [telemetry.md](../cross-cutting/telemetry.md) for the full request data point shape.

**Domain event:** On successful maintenance record creation, a `MaintenanceRecordCreated` event is published to the event bus and captured by a maintenance-record telemetry handler (planned dataset: `pineapple_maintenance_domain_events`, binding: `MAINTENANCE_DOMAIN_TELEMETRY`). The event must not include user-entered title or notes in telemetry blobs.

**MaintenanceRecordCreated data point contract:**

| Field        | Name                    | Value                                                   |
| ------------ | ----------------------- | ------------------------------------------------------- |
| `indexes[0]` | -                       | `owner_id` (partition key for per-owner queries)        |
| `blobs[0]`   | `event_type`            | `"MaintenanceRecordCreated"`                            |
| `blobs[1]`   | `aggregate_type`        | `"MaintenanceRecord"`                                   |
| `blobs[2]`   | `maintenance_record_id` | Maintenance record UUID                                 |
| `blobs[3]`   | `asset_id`              | Asset UUID                                              |
| `blobs[4]`   | `owner_id`              | Owner UUID                                              |
| `blobs[5]`   | `actor_id`              | UUID of the authenticated user who performed the action |
| `blobs[6]`   | `source_use_case`       | `"CreateMaintenanceRecord"`                             |
| `blobs[7]`   | `schema_version`        | `"v1"`                                                  |
| `blobs[8]`   | `result`                | `"success"`                                             |
| `doubles[0]` | `count`                 | Always `1`                                              |
| `doubles[1]` | `event_time_ms`         | Event timestamp (ms since epoch)                        |
| `doubles[2]` | `performed_date_ms`     | Performed date at UTC midnight (ms since epoch)         |

## Flags

**REVIEW NEEDED - Dashboard entry path belongs with dashboard design:** Creation must be available from the asset detail page. A dashboard entry path is desired, but the exact interaction and placement should be resolved in the dashboard spec after design review.

**NOT SPECIFIED - Navigation after successful creation:** The user should remain in or return to the asset context, but the exact presentation is not specified: inline form, modal, drawer, or separate route.

**FOLLOW-UP NEEDED - Cross-cutting time spec:** This feature uses a local mitigation for date-only maintenance records. A future cross-cutting time spec should define project-wide rules for date-only fields, timestamps, user time zones, server clock comparisons, and telemetry conversions.

## Out of Scope

- Editing maintenance records
- Deleting maintenance records
- Service schedules, reminders, recurrence rules, next-due dates, and maintenance-task definitions
- Structured maintenance task/category management
- Structured component or location tracking for repeated failures
- Structured quantity, cost, vendor, mileage, odometer, or attachment fields
- Automatic lifetime, consumption, replacement-interval, or failure-frequency analytics
- Cross-asset maintenance history views
