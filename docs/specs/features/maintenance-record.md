---
name: maintenance-record
description: Historical maintenance log entries tied to assets, including creation, asset-level history, validation, ownership, and telemetry
metadata:
  type: feature
---

# Maintenance Record

**Status:** in-progress
**Owner:** [unknown - assign on review]
**Last Updated:** 2026-08-21
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [dashboard.md](./dashboard.md), [maintenance-task.md](./maintenance-task.md), [activity-history.md](./activity-history.md)

---

## Summary

The Maintenance Record feature lets an authenticated user create, correct, delete, and view dated maintenance log entries for an asset. Records capture what was done, when it was done, and optional notes so the user can later answer questions like "when did I last change this?". When a record is linked to a recurring task, correcting or deleting the record also restores that task's schedule from its original seed and the remaining linked records; it never treats a correction as newly completed work.

## User Stories

- As an **authenticated user**, I can **record completed maintenance on an asset I can access** so that **the fleet has a durable history of work performed**
- As **DIYer Dale**, I can **record a home air-filter change** so that **I can later see when I last changed it**
- As **DIYer Dale**, I can **record a propane tank replacement on my toy hauler trailer** so that **I can later compare replacement history manually**
- As **DIYer Dale**, I can **record a sprinkler replacement with location details in notes** so that **I can later spot repeated problems by reviewing the history**
- As **DIYer Dale**, I can **record when I added water softener pellets** so that **I can later see my replenishment history**
- As an **authenticated user**, I can **view maintenance records for an asset I can access in reverse chronological order** so that **the most recent work is easiest to find**
- As a **user entering a maintenance record**, I can **see clear validation errors** so that **I know exactly what must be corrected before saving**
- As an **authenticated user with access to an asset**, I can **edit a record's title, performed date, or notes** so that **I can correct a mistake without deleting the history entry**
- As an **authenticated user with access to an asset**, I can **delete an incorrect maintenance record** so that **the maintenance history and any linked task schedule no longer rely on false data**
- As a **user correcting a linked record**, I can **see the linked task's schedule recomputed from the surviving evidence** so that **a correction does not leave the next due date stale or silently shifted**
- As a **user reviewing Activity History**, I can **see record corrections and deletions as additional immutable entries** so that **the action trail is preserved without rewriting prior events**

## Acceptance Criteria

- [ ] `S1` A maintenance record is always tied to an existing asset the requester can access
- [ ] `S1` The API never accepts `ownerId` in the request body; record ownership is derived from the target asset, while the authenticated session supplies the actor/requester
- [ ] `S1` The create use case checks that the target asset exists and the requester can access it before creating the record
- [ ] `S1` The list use case returns only records for an asset the requester can access
- [ ] `S1` `POST /api/assets/{assetId}/maintenance-records` accepts `{ title, performedAt, notes?, taskId? }` and returns the full created maintenance record with status 201; `taskId` behavior is defined in [maintenance-task.md](./maintenance-task.md)
- [ ] `S1` `GET /api/assets/{assetId}/maintenance-records` returns `{ maintenanceRecords: [...] }` with status 200
- [ ] `S1` Maintenance record responses contain `id`, `assetId`, `title`, `performedAt`, nullable `notes`, nullable `taskId`, and `createdAt`; `ownerId` is never exposed
- [ ] `S1` The user can start maintenance record creation from an asset detail page
- [ ] `S1` The maintenance record form requires a **Title** field describing the work performed
- [ ] `S1` Title is limited to 100 characters
- [ ] `S1` The maintenance record form requires a **Performed date** field
- [ ] `S1` The maintenance record form includes optional **Notes** for free-form details such as component location, observed condition, cost, vendor, quantity, or replacement context
- [ ] `S1` Notes are limited to 1000 characters
- [ ] `S1` The performed date must be today or earlier; future dates are rejected with a field-level validation error
- [ ] `S1` Performed date is treated as date-only data in `YYYY-MM-DD` format, not as a user-local timestamp
- [ ] `S1` The API uses the current UTC calendar date as the authoritative definition of today
- [ ] `S1` An archived asset's maintenance history remains readable, but creating a new record for it returns 409
- [ ] `S1` Submitting with missing or invalid required fields shows an error banner and field-level errors
- [ ] `S1` Editing a field that has an error clears that field's error immediately
- [ ] `S1` Save button shows "Saving..." and is disabled while save is in flight
- [ ] `S1` On successful save, the asset's maintenance history includes the newly created record
- [ ] `S1` On successful save, the user stays on `/app/assets/{assetId}/maintenance`; the record list refreshes and the newly created record is visible
- [ ] `S1` The asset maintenance history shows records newest first by performed date
- [ ] `S1` If two records have the same performed date, the most recently created record appears first
- [ ] `S1` An asset with no maintenance records shows an empty state with an action to add the first record
- [ ] `S1` A 401 response from the API redirects to `/login` through the API client layer
- [ ] `S1` A 403 response is shown as an access-denied error if the asset exists but the requester cannot access it
- [ ] `S1` A 404 response is shown as a not-found error if the asset does not exist
- [ ] `S1` A non-401 API error shows a banner with the server error message; if the API identifies a specific field, the error is mapped to that field
- [ ] `S1` Creating a maintenance record publishes a `MaintenanceRecordCreated` domain event

### Record editing

- [ ] `S2` `PATCH /api/assets/{assetId}/maintenance-records/{recordId}` accepts one or more of `title`, `performedAt`, and `notes`, and returns the updated record with status 200
- [ ] `S2` The edit request never accepts or changes `taskId`, `assetId`, `ownerId`, or `createdAt`
- [ ] `S2` At least one editable field must be present; an empty edit body returns 422
- [ ] `S2` Omitted editable fields remain unchanged; blank or explicit `null` `notes` normalizes to `null`; forbidden keys (`taskId`, `assetId`, `ownerId`, or `createdAt`) and every other unknown key return 422 instead of being silently stripped
- [ ] `S2` Edited title, performed date, and notes use the same validation and normalization rules as record creation
- [ ] `S2` A missing record or a record whose asset does not match the `{assetId}` path returns 404; otherwise editing requires current access to the record's asset, with inaccessible assets returning 403 and archived assets returning 409
- [ ] `S2` Editing a record on an archived asset returns 409; archived history is readable but correction is blocked
- [ ] `S2` Each record has an internal optimistic `revision` initialized to `0`; edits and deletes conditionally advance it, and the field is never accepted or returned by the API
- [ ] `S2` Editing only title or notes does not change a linked task's schedule
- [ ] `S2` Editing `performedAt` recomputes a linked task from the normalized edited record plus all other records still linked to the task, using its immutable schedule seed as defined in [maintenance-task.md](./maintenance-task.md)
- [ ] `S2` An edit that produces no value changes at the record revision CAS linearization point returns the current record with status 200 and publishes no update event; if the revision changes before that point, the operation retries against fresh state instead of returning a stale no-op
- [ ] `S2` A successful edit publishes exactly one `MaintenanceRecordUpdated` event containing the full normalized before-and-after record snapshots needed by History and durable consumers; it never publishes `MaintenanceRecordCreated`, `MaintenanceTaskAdvanced`, or `MaintenanceTaskUpdated`
- [ ] `S2` The asset maintenance page exposes an edit action with a prefilled form and refreshes the record list and linked task after success

### Record deletion

- [ ] `S3` `DELETE /api/assets/{assetId}/maintenance-records/{recordId}` hard-deletes the record and returns 204
- [ ] `S3` DELETE uses the same lookup precedence as PATCH: a missing record or record/asset path mismatch returns 404; an existing record on an inaccessible asset returns 403; an accessible archived asset returns 409, with access checked before archived state is revealed
- [ ] `S3` Deleting a record on an archived asset returns 409; archived history is readable but deletion is blocked
- [ ] `S3` Deleting a record never deletes or mutates other records
- [ ] `S3` Deleting a linked record recomputes the task from all records still linked to the task, excluding the deleted record, using its immutable schedule seed as defined in [maintenance-task.md](./maintenance-task.md)
- [ ] `S3` A successful deletion publishes exactly one `MaintenanceRecordDeleted` event containing the full normalized deleted-record snapshot needed by History; it never publishes `MaintenanceRecordCreated`, `MaintenanceTaskAdvanced`, or `MaintenanceTaskUpdated`
- [ ] `S3` The asset maintenance page requires confirmation before deletion, shows a pending state, removes the record after success, and refreshes any linked task
- [ ] `S3` Record persistence, linked-task reconciliation, implicit task-deletion unlinks, and producer-side outbox events commit atomically; task-affecting mutations use the task and record optimistic revisions, conditionally require every expected row update/delete to affect its snapshotted row count, attempt once and retry the complete operation up to three additional times against the latest state, and return 409 with no partial mutation after the fourth conflict

### Correction history

- [ ] `S2` A record edit creates an immutable `maintenance_record_updated` Activity History entry; the existing entry is not rewritten, and the durable projection retains the full normalized before-and-after snapshot including notes
- [ ] `S3` A record deletion creates an immutable `maintenance_record_deleted` Activity History entry; the deleted record is absent from the maintenance-record list but remains represented in History, and the durable projection retains the full normalized deleted snapshot including notes
- [ ] `S2` The asset-page edit flow exposes loading, success, validation, 401, 403, 404, 409, and frozen-write 503 states; archived assets do not render correction controls
- [ ] `S3` The asset-page delete flow exposes confirmation, loading, success, retryable failure, 401, 403, 404, 409, and frozen-write 503 states; repeated deletion returns 404 and produces no second event

## Delivery Plan

| Slice | Scope                                                                                                                        | Issue                                                      | Depends on |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- |
| `S1`  | Existing record creation/listing and asset-page history. Shipped on `main`; acceptance boxes need brownfield reconciliation. | -                                                          | -          |
| `S2`  | Edit record title, notes, or performed date; reconcile linked task schedule; publish correction events.                      | [#181](https://github.com/snaveevans/pineapple/issues/181) | `S1`       |
| `S3`  | Delete records; preserve immutable History snapshots; add asset-page edit/delete controls.                                   | [#181](https://github.com/snaveevans/pineapple/issues/181) | `S2`       |

## Validation & Ownership

**Authentication:** This feature is available only to authenticated users. API requests use the resolved `User.id` as `requesterId`.

**Permissions:** Maintenance records are owned through the asset they belong to. A user can create, list, edit, and delete maintenance records for active assets they can access: assets they own and assets shared with their team. Archived asset history remains readable, but archived records are not mutable in this slice. The record owner remains the asset owner, while `actorId` identifies the user who performed the mutation. The client cannot supply `ownerId`.

**HTTP validation:** Inputs are validated at the Zod HTTP edge in `apps/api/src/api/schemas/maintenanceRecordSchemas.ts` and drive the generated OpenAPI contract. The create schema requires `title` and `performedAt`, allows optional `notes` and `taskId`, enforces title length <= 100 characters, enforces notes length <= 1000 characters, validates path ids as UUIDs, and rejects malformed calendar dates. The edit schema allows only `title`, `performedAt`, and `notes`, requires at least one field, and never accepts `taskId`. The domain performs the authoritative current-UTC-date comparison.

**Create lookup precedence when `taskId` is supplied:** resolve and authorize the path asset first (missing asset 404, inaccessible asset 403, archived path asset 409); then resolve the referenced task (missing task 404). If the task belongs to a different asset, check access to that task's parent asset: an inaccessible foreign task returns 404 and an accessible foreign task returns 422 with a `taskId` field error, regardless of whether that foreign asset is archived. A same-asset task proceeds with the already-authorized asset. This nested foreign-reference exception is recorded in [permissions.md](../cross-cutting/permissions.md); direct task requests remain 403 for an existing inaccessible task.

**Domain validation:** Domain construction and edit validation trim title and notes, convert blank notes to `null`, and preserve these invariants: a maintenance record has an asset ID, owner ID derived from the target asset, actor/requester ID derived from the session context, non-empty title of 100 characters or fewer, date-only performed date of today or earlier, nullable notes of 1000 characters or fewer, a task link that correction endpoints cannot change, an internal optimistic revision, and a UTC creation timestamp. Task deletion explicitly unlinks every linked record by setting its `taskId` to null and incrementing its record revision; no other operation changes the link. A record deletion has no replacement record state; its deleted snapshot is carried by the domain event.

**Linked-task reconciliation:** When a linked record is edited, the application applies the normalized edit first and recomputes from that record plus all other records still linked to the task. When a record is deleted, recomputation excludes the deleted record. The task's immutable creation seed, initial completion state, and optimistic revision are internal fields and are not exposed in the maintenance-task API. The record's own optimistic revision is likewise internal. The exact formula and event boundary are defined in [maintenance-task.md](./maintenance-task.md); the record mutation and task update commit in one producer-side transaction. A task-affecting mutation reads the current task and record revisions, conditionally writes the resulting record/task state with each revision incremented by one, and retries the complete operation against fresh state after the initial attempt loses a race, up to three additional attempts. The fourth conflict returns 409 with the record, task, and outbox transaction rolled back; validation, 404, archive, and no-op outcomes are not retried. If task deletion wins a race, its required unlink is the current state used by the retry; a later record correction updates the now-unlinked record without reconciling a deleted task. If another correction deletes the record first, a competing edit retries and returns 404; if two edits race, their normalized PATCH operations serialize and the later successful operation wins. If an edit commits before delete, deletion uses the edited snapshot; if delete commits first, an edit retry returns 404; two deletes serialize with one 204/event and one 404/no event.

**Persistence migration:** Add the record `revision`, an internal `legacy_revision_pending DEFAULT 1` discriminator, and the Activity History correction-audit payload through the expand/contract policy in [schema-migrations.md](../cross-cutting/schema-migrations.md). The new writer explicitly supplies `revision` and `legacy_revision_pending = 0`. The expansion includes an `AFTER INSERT` compatibility trigger that fills `revision = 0` only when `legacy_revision_pending = 1`, then sets the discriminator to `0`; it has no UPDATE trigger and never overwrites a backfilled or incremented revision. Existing records receive the same value idempotently before correction code is promoted. The durable History projection adds its internal audit snapshot storage without changing existing entries. The pre-deploy validation query must report zero rows with a null record revision, and the deploy workflow must stop before Worker deployment when the count is nonzero. The trigger is removed only in a later contract migration after the new writer is live.

**Date-only mitigation:** Until a cross-cutting time spec exists, this feature treats `performedAt` as a timezone-free calendar date string in `YYYY-MM-DD` format across the UI, API, domain, and D1 persistence. The implementation must compare dates lexicographically against today's `YYYY-MM-DD` value and must not parse `performedAt` through `Date` for validation, storage, or display. The stored maintenance date is not "in UTC"; it is a date-only value with no time zone. Generated timestamps such as `createdAt`, domain event time, and request telemetry time are UTC instants. Event telemetry may convert `performedAt` to UTC midnight only at the telemetry boundary because Analytics Engine doubles require a number.

**Field errors:** Validation errors map back to `title`, `performedAt`, and `notes` when the backend includes a known `field` value.

## Edge Cases & Error States

| Scenario                                                                      | Expected Behavior                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset has no maintenance records                                              | Empty state shown with an add action                                                                                                                |
| Title is empty                                                                | Save blocked; title field shows a required-field error                                                                                              |
| Title is over 100 characters                                                  | Save blocked; title field shows a max-length error                                                                                                  |
| Performed date is empty                                                       | Save blocked; performed date field shows a required-field error                                                                                     |
| Performed date is in the future                                               | Save blocked; performed date field shows a "must be today or earlier" error                                                                         |
| Notes is empty or whitespace-only                                             | Accepted and normalized to `null`                                                                                                                   |
| Notes is over 1000 characters                                                 | Save blocked; notes field shows a max-length error                                                                                                  |
| Notes contains component details                                              | Accepted as free text; no structured component/location fields are created                                                                          |
| Asset is archived and history is requested                                    | Existing maintenance history is returned                                                                                                            |
| Asset is archived and record creation is attempted                            | Creation rejected with 409                                                                                                                          |
| User submits and the API returns 422 with a field                             | Banner shown and the server message is pinned to the matching form field                                                                            |
| User submits and the API returns 422 without field                            | Banner shown; no field highlighted                                                                                                                  |
| User submits and the API returns 401                                          | Redirect to `/login` (replace history entry)                                                                                                        |
| User submits or views another user's asset                                    | 403 access-denied treatment                                                                                                                         |
| User submits or views a missing asset                                         | 404 not-found treatment                                                                                                                             |
| Maintenance history request fails                                             | Error state shown with retry action                                                                                                                 |
| Maintenance history request is pending                                        | Loading state shown; history area is not blank                                                                                                      |
| User edits a field after a failed submit                                      | Field error clears and mutation error state resets                                                                                                  |
| User records two entries on the same performed date                           | Both records are shown; newest created entry sorts first within that date                                                                           |
| User edits only a record title or notes                                       | Record updates; linked task state and reminder schedule are unchanged                                                                               |
| User edits a linked record to an earlier date                                 | Task uses the latest surviving completion, unless an original completion seed is later                                                              |
| User edits the latest linked record to a later date                           | Task `lastCompletedDate` and `nextDue` move to the edited date plus interval                                                                        |
| User deletes a non-latest linked record                                       | Record is removed; task schedule remains based on the latest surviving date                                                                         |
| User deletes the latest linked record                                         | Task rewinds to the latest remaining completion or its original seed                                                                                |
| User deletes the only linked record on a task with no initial completion date | `lastCompletedDate` becomes null; `nextDue` returns to the task creation seed                                                                       |
| User attempts to change a record's task link                                  | 422; task linkage is immutable in this slice                                                                                                        |
| PATCH omits a field                                                           | Existing value remains unchanged                                                                                                                    |
| PATCH sends blank or null `notes`                                             | Notes are cleared to `null`                                                                                                                         |
| PATCH sends a forbidden key                                                   | 422; no mutation is applied                                                                                                                         |
| Record belongs to a different asset than the path                             | 404; no access or archive state is revealed                                                                                                         |
| Record id is missing for PATCH or DELETE                                      | 404; no mutation or event is produced                                                                                                               |
| User edits or deletes a record on a shared asset                              | Mutation succeeds under the same access rule as record creation                                                                                     |
| User edits or deletes a record on an archived asset                           | 409; existing history remains readable and unchanged                                                                                                |
| Record edit/delete succeeds                                                   | Maintenance list and affected task are refreshed; History gains an entry                                                                            |
| Record edit/delete fails after validation                                     | No record, task, or outbox state is partially changed                                                                                               |
| DELETE is repeated after successful deletion                                  | 404; no second event or task mutation is produced                                                                                                   |
| Concurrent task-affecting mutation loses its revision race                    | Retry against current state; after the bounded limit, return 409 with no partial record, task, or outbox change                                     |
| Runtime reads a task with a null schedule seed after rollout                  | Emit an observable invariant failure and return 500; never synthesize a current-date seed or partially mutate the request                           |
| Runtime reads a record with a null revision after rollout                     | Emit an observable invariant failure and return 500; do not apply a correction or write an outbox event                                             |
| Record edit races with record deletion                                        | The first committed operation wins; the second retries against the latest row and returns either the resulting 204 or 404 without a duplicate event |

## Telemetry

**Request telemetry:** `POST /api/assets/{assetId}/maintenance-records` maps to `CreateMaintenanceRecord`, `GET /api/assets/{assetId}/maintenance-records` maps to `ListMaintenanceRecords`, `PATCH /api/assets/{assetId}/maintenance-records/{recordId}` maps to `UpdateMaintenanceRecord`, and `DELETE /api/assets/{assetId}/maintenance-records/{recordId}` maps to `DeleteMaintenanceRecord` via `createTechnicalTelemetryMiddleware`. All route patterns must be added to the operation name mapping in `technicalTelemetry.ts`; see [telemetry.md](../cross-cutting/telemetry.md) for the full request data point shape.

**Domain event:** On successful maintenance record creation, a `MaintenanceRecordCreated` event is published to the event bus and captured by a maintenance-record telemetry handler (planned dataset: `pineapple_maintenance_domain_events`, binding: `MAINTENANCE_DOMAIN_TELEMETRY`). The event must not include user-entered title or notes in telemetry blobs.

**Correction events:** A successful edit publishes exactly one `MaintenanceRecordUpdated` event with `recordId`, `assetId`, `ownerId`, `actorId`, actor display-name snapshot, asset snapshot, `createdAt` (the original record creation timestamp), resulting `recordRevision`, the current nullable `taskId` (correction endpoints cannot change it; a prior task deletion may have unlinked it), normalized `before` and `after` values for `title`, `performedAt`, and `notes`, and the `maintenance_record_updated` History conclusion. A successful hard delete publishes exactly one `MaintenanceRecordDeleted` event with the same identity and snapshots plus `recordRevision = prior record revision + 1` captured before row removal, the full normalized deleted-record snapshot, and the `maintenance_record_deleted` History conclusion. Neither correction event is a completion event; corrections never publish `MaintenanceRecordCreated`, `MaintenanceTaskAdvanced`, or `MaintenanceTaskUpdated`. When a linked task's derived schedule changes because of either mutation, the application also publishes one `MaintenanceTaskReconciled` Smart Event defined in [maintenance-task.md](./maintenance-task.md). The events are written to the producer-side outbox in the same D1 batch as the record and task changes. Telemetry handlers write ids, enums, dates, and change flags only; user-entered title and notes remain out of Analytics Engine.

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

**REVIEW NEEDED - `S1` boxes describe shipped create/list behavior but have not been reconciled with tests on `main`:** The existing record creation and history flows are live. A brownfield pass should tick each `S1` box a test actually covers and split or correct any that are not true. The new `S2`/`S3` boxes belong to #181.

**REVIEW NEEDED - Dashboard entry path belongs with dashboard design:** Creation must be available from the asset detail page. A dashboard entry path is desired, but the exact interaction and placement should be resolved in the dashboard spec after design review. Record correction controls are intentionally asset-page-only in this slice.

**DECISION - Navigation after successful creation:** The user stays on `/app/assets/{assetId}/maintenance`; the record list refreshes and shows the newly created record.

**FOLLOW-UP NEEDED - Cross-cutting time spec:** This feature uses a local mitigation for date-only maintenance records. A future cross-cutting time spec should define project-wide rules for date-only fields, timestamps, user time zones, server clock comparisons, and telemetry conversions.

## Out of Scope

- Changing a record's linked `taskId`; relinking is a separate product decision
- Direct task rescheduling, snooze, or reminder controls; rescheduling is tracked in [#235](https://github.com/snaveevans/pineapple/issues/235) and snooze in [#236](https://github.com/snaveevans/pineapple/issues/236)
- Service-schedule creation, recurrence-rule editing, and task interval editing (those behaviors are defined in [maintenance-task.md](./maintenance-task.md))
- Structured maintenance task/category management
- Structured component or location tracking for repeated failures
- Structured quantity, cost, vendor, mileage, odometer, or attachment fields
- Automatic lifetime, consumption, replacement-interval, or failure-frequency analytics
- Cross-asset maintenance history views
