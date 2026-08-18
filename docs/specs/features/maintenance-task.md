---
name: maintenance-task
description: Time-based recurring maintenance tasks tied to assets, with automatic next-due advancement when a linked maintenance record is logged
metadata:
  type: feature
---

# Maintenance Task

**Status:** active
**Owner:** product and engineering
**Last Updated:** 2026-08-17
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [maintenance-record.md](./maintenance-record.md), [dashboard.md](./dashboard.md), [activity-history.md](./activity-history.md)

---

## Summary

The Maintenance Task feature lets an authenticated owner-operator define scheduled maintenance work for an asset — specifying what to do and how often (time-based interval) — so they always know when maintenance is next due. When a maintenance record is linked to a task at logging time, the task's next-due date automatically advances based on when the work was performed. Tasks are the scheduling counterpart to the Maintenance Record log: records capture what _was_ done; tasks capture what _should_ be done and when.

## User Stories

- As an **authenticated owner-operator**, I can **create a time-based maintenance task for one of my assets** so that **I know what recurring maintenance is scheduled and when it's next due**
- As **DIYer Dale**, I can **seed a new task with a last-completed date** so that **the next-due date reflects reality from the moment I create the task**
- As **DIYer Dale**, I can **create a "replace furnace filter every 2 months" task for my house without a last-completed date** so that **the system starts counting from today**
- As an **authenticated owner-operator**, I can **list the maintenance tasks for one of my assets** so that **I can see all scheduled work and when each item is next due**
- As **DIYer Dale**, I can **link a maintenance record to a task when logging completed work** so that **the task's next-due date advances automatically to reflect the work I just performed**
- As **DIYer Dale**, I can **use a task's dedicated "Log maintenance" flow** so that **the record is pre-linked to the task without extra steps**
- As an **authenticated owner-operator**, I can **delete a maintenance task** so that **stale or incorrect tasks don't clutter my asset**
- As a **user who deletes a task**, my **existing maintenance records are preserved** so that **my historical maintenance log is not lost**
- As an **authenticated owner-operator**, I can **edit a task's title or interval** so that **I can correct a mistake without losing `lastCompletedDate` or churning the task's history the way delete-and-recreate does**

## Acceptance Criteria

<!-- These boxes are the live implementation checklist: check a box (`- [x]`) only when the
behavior is implemented AND covered by a test on `main`. Every criterion carries exactly one
slice tag (`S1`…) from the Delivery Plan below — so each box has a home and "slice done = its
tagged boxes are all `[x]`." See docs/specs/SPECS.md. -->

### Task creation

- [x] `S1` A maintenance task is always tied to an existing asset owned by the authenticated user
- [x] `S1` `POST /api/assets/{assetId}/maintenance-tasks` accepts `{ title, intervalValue, intervalUnit, lastCompletedDate? }` and returns the full created task with status 201
- [x] `S1` `ownerId` is never accepted in the request body; it is derived from the authenticated session
- [x] `S1` `title` is required and limited to 100 characters
- [x] `S1` `intervalValue` is required and must be a positive integer (≥ 1)
- [x] `S1` `intervalUnit` is required and must be one of `"day" | "week" | "month" | "year"`
- [x] `S1` `lastCompletedDate` is optional; when provided it must be a valid YYYY-MM-DD date that is today or earlier
- [x] `S1` When `lastCompletedDate` is provided, `nextDue = lastCompletedDate + interval` (calendar-based arithmetic)
- [x] `S1` When `lastCompletedDate` is omitted, `nextDue = today (UTC calendar date) + interval`
- [x] `S1` Creating a task for an archived asset returns 409
- [x] `S1` The create use case checks that the target asset exists and belongs to the authenticated user before creating the task

### Task list

- [x] `S1` `GET /api/assets/{assetId}/maintenance-tasks` returns `{ maintenanceTasks: [...] }` with status 200
- [x] `S1` The list use case returns only tasks for an asset owned by the authenticated user
- [x] `S1` Each task in the response includes `id`, `assetId`, `title`, `intervalValue`, `intervalUnit`, `lastCompletedDate` (nullable), `nextDue`, and `createdAt`; `ownerId` is never exposed
- [x] `S1` Tasks are returned in ascending `nextDue` order (soonest due first)
- [x] `S1` The dashboard's cross-asset queue is exposed through [dashboard.md](./dashboard.md), not by requiring the web app to call this asset-scoped endpoint once per asset

### Task deletion

- [x] `S1` `DELETE /api/assets/{assetId}/maintenance-tasks/{taskId}` returns 204 on success
- [x] `S1` Deleting a task that doesn't exist returns 404
- [x] `S1` Deleting a task that belongs to another user returns 403
- [x] `S1` Existing maintenance records previously linked to the deleted task are preserved with their `taskId` set to null

### Task edit

- [x] `S2` `PATCH /api/assets/{assetId}/maintenance-tasks/{taskId}` accepts `{ title?, intervalValue?, intervalUnit? }` and returns the full updated task with status 200
- [x] `S2` At least one of `title`, `intervalValue`, `intervalUnit` must be present in the request body; a body with none of them returns 422
- [x] `S2` `lastCompletedDate` and `nextDue` are not fields on this endpoint's request schema; the endpoint never accepts a direct override of either — `nextDue` is always derived (see recompute rule below)
- [x] `S2` `ownerId` is never accepted in the request body; it is derived from the authenticated session
- [x] `S2` When provided, `title` follows the same validation as task creation (non-empty after trim, ≤100 characters)
- [x] `S2` When provided, `intervalValue` follows the same validation as task creation (positive integer ≥ 1)
- [x] `S2` When provided, `intervalUnit` follows the same validation as task creation (one of `day | week | month | year`)
- [x] `S2` A field omitted from the request body keeps its current stored value
- [x] `S2` When the request includes `intervalValue` and/or `intervalUnit`, `nextDue` is recomputed as `(lastCompletedDate ?? todayUtc) + interval`, using the resulting `intervalValue`/`intervalUnit` and the same calendar arithmetic as task creation
- [x] `S2` When the request includes only `title` (no `intervalValue` or `intervalUnit`), `lastCompletedDate` and `nextDue` are left unchanged
- [x] `S2` When the requested `title`, `intervalValue`, and `intervalUnit` (after applying only the provided fields) are identical to the task's current stored values, the edit is a no-op: the task is returned unchanged with status 200, and no `MaintenanceTaskUpdated` event is published
- [x] `S2` Editing a task on an archived asset is permitted — asset archival blocks new maintenance activity (creating tasks or records), not correction of an existing task's metadata
- [x] `S2` Editing a task that doesn't exist returns 404
- [x] `S2` Editing a task that exists but belongs to a different asset than the path `assetId` returns 404
- [x] `S2` Editing a task whose asset the requester cannot access returns 403
- [x] `S2` The update use case checks that the target asset exists and the requester can access it before applying the edit, following the same asset-then-task-then-access order as task deletion
- [x] `S2` A successful edit that changes `title`, `intervalValue`, or `intervalUnit` publishes a `MaintenanceTaskUpdated` domain event carrying the resulting `nextDue` as a producer-owned conclusion (ADR-0010), so the notifications scheduler reschedules the pending reminder via its existing supersede path without reading task storage back

### Record-task linking (change to existing maintenance-record endpoint)

- [x] `S1` `POST /api/assets/{assetId}/maintenance-records` accepts an optional `taskId` field in the request body
- [x] `S1` When `taskId` is provided, it must reference a maintenance task belonging to the same asset; a task from a different asset returns 422
- [x] `S1` When `taskId` references a task owned by a different user, 404 is returned (existence is not revealed)
- [x] `S1` Maintenance record responses include a nullable `taskId` field
- [x] `S1` When a linked record's `performedAt` is strictly greater than the task's current `lastCompletedDate` (or the task has no `lastCompletedDate`), the task's `lastCompletedDate` updates to `record.performedAt` and `nextDue` advances accordingly
- [x] `S1` When a linked record's `performedAt` is earlier than the task's current `lastCompletedDate`, `lastCompletedDate` and `nextDue` are unchanged — linking an older record never regresses the next-due date
- [x] `S1` Linking a record to a task for an archived asset returns 409 (the existing archived-asset rule for record creation applies)

### General

- [x] `S1` A 401 response from the API redirects to `/login` through the API client layer
- [x] `S1` A 403 response from asset or task ownership checks is shown as an access-denied error
- [x] `S1` A 404 response is shown as a not-found error when the asset or task does not exist
- [x] `S2` A 403/404 response from a task edit is shown using the same access-denied / not-found treatment as the rest of this feature

## Delivery Plan

| Slice | Scope                                                                                                                              | Issue | Depends on |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- |
| `S1`  | Task creation, listing, deletion, and record-task linking (already shipped)                                                        | —     | —          |
| `S2`  | Task edit: `PATCH` for `title`/`intervalValue`/`intervalUnit` with recomputed `nextDue` and a `MaintenanceTaskUpdated` Smart Event | #180  | `S1`       |

## Validation & Ownership

**Authentication:** This feature is available only to authenticated users. API requests use the resolved `User.id` as `ownerId`.

**Permissions:** Tasks are owned through the asset they belong to. A user can create, list, delete, and edit tasks only for assets they own or that are shared with their team (same access rule as create/delete — see `canAccessAsset`). The client cannot supply `ownerId`.

**HTTP validation:** Inputs are validated at the Zod HTTP edge in `apps/api/src/api/schemas/maintenanceTaskSchemas.ts`. Required fields (create): `title` (string, max 100 chars), `intervalValue` (positive integer), `intervalUnit` (enum: `day | week | month | year`). Optional (create): `lastCompletedDate` (YYYY-MM-DD, today or earlier). For maintenance record creation, `taskId` is optional (UUID). The edit (`PATCH`) schema makes `title`, `intervalValue`, and `intervalUnit` all optional but validated with the same per-field rules as create when present, and refines that at least one of the three must be supplied; it declares no `lastCompletedDate` or `nextDue` field at all, so either key in a request body is silently stripped by Zod's default unknown-key handling rather than rejected or applied.

**Domain validation:** Domain construction trims title and preserves these invariants: non-empty title of at most 100 characters; positive integer interval value; valid interval unit; date-only `lastCompletedDate` of today or earlier when provided; `nextDue` always present and derived from `lastCompletedDate` (or today's UTC calendar date) + interval. Editing reuses the same invariants — an edit cannot leave the task in a state creation itself couldn't produce.

**Next-due arithmetic:** Interval arithmetic is calendar-based. "2 months from 2026-01-31" yields "2026-03-31"; if the resulting day exceeds the month length, clamp to the last day of that month. The implementation must not parse date strings through `Date` for calendar arithmetic; use manual calendar math or a WinterCG-compatible date library. Editing must reuse this same `addInterval` implementation, not a second one.

**Edit recompute rule:** An edit that supplies `intervalValue` and/or `intervalUnit` recomputes `nextDue = addInterval(lastCompletedDate ?? todayUtc, resultingIntervalValue, resultingIntervalUnit)` — the identical formula task creation uses, just with the task's current `lastCompletedDate` (if any) as the baseline instead of a client-supplied one. A title-only edit does not touch `lastCompletedDate` or `nextDue` at all, so correcting a task's name can never shift its schedule as a side effect.

**Date-only mitigation:** Same convention as [maintenance-record.md](./maintenance-record.md). `lastCompletedDate` and `nextDue` are timezone-free YYYY-MM-DD strings across the API, domain, and D1 persistence. Today's UTC calendar date is authoritative for seeding, comparisons, and edit recomputation.

**Field errors:** Validation errors map back to `title`, `intervalValue`, `intervalUnit`, and `lastCompletedDate` when the backend includes a known `field` value.

## Edge Cases & Error States

| Scenario                                                                       | Expected Behavior                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Asset has no maintenance tasks                                                 | List returns `{ maintenanceTasks: [] }`                                                      |
| `title` is empty                                                               | 422; title field shows required-field error                                                  |
| `title` is over 100 characters                                                 | 422; title field shows max-length error                                                      |
| `intervalValue` is 0 or negative                                               | 422; intervalValue field shows must-be-positive error                                        |
| `intervalValue` is not an integer                                              | 422; intervalValue field shows type error                                                    |
| `intervalUnit` is not a valid enum value                                       | 422; intervalUnit field shows invalid-value error                                            |
| `lastCompletedDate` is in the future                                           | 422; lastCompletedDate field shows "must be today or earlier" error                          |
| `lastCompletedDate` is malformed                                               | 422; lastCompletedDate field shows format error                                              |
| `lastCompletedDate` omitted                                                    | `nextDue` seeded as today (UTC calendar date) + interval                                     |
| Asset is archived; task creation attempted                                     | 409                                                                                          |
| Asset is archived; task list requested                                         | Existing task list is returned normally                                                      |
| Asset is archived; record with `taskId` provided                               | 409 (archived-asset rule on record creation applies)                                         |
| Linked record's `performedAt` equals task's `lastCompletedDate`                | `lastCompletedDate` and `nextDue` unchanged                                                  |
| Linked record's `performedAt` is older than task's `lastCompletedDate`         | `lastCompletedDate` and `nextDue` unchanged                                                  |
| `taskId` in record creation belongs to a different asset (same user)           | 422; taskId field shows "task does not belong to this asset"                                 |
| `taskId` in record creation belongs to another user's task                     | 404                                                                                          |
| `taskId` in record creation references a non-existent task                     | 404                                                                                          |
| Task is deleted while it has linked records                                    | 204; linked records preserved with `taskId` set to null                                      |
| Deleting a task that doesn't exist                                             | 404                                                                                          |
| Deleting another user's task                                                   | 403                                                                                          |
| User lists tasks for another user's asset                                      | 403                                                                                          |
| User lists tasks for a non-existent asset                                      | 404                                                                                          |
| PATCH body has none of `title`, `intervalValue`, `intervalUnit`                | 422; banner shown, no field highlighted                                                      |
| PATCH `title` present but empty/whitespace-only                                | 422; title field shows required-field error                                                  |
| PATCH `title` exceeds 100 characters                                           | 422; title field shows max-length error                                                      |
| PATCH `intervalValue` is 0, negative, or non-integer                           | 422; intervalValue field shows validation error                                              |
| PATCH `intervalUnit` is not `day`/`week`/`month`/`year`                        | 422; intervalUnit field shows invalid-value error                                            |
| PATCH body includes `lastCompletedDate` or `nextDue`                           | Silently ignored (not part of the schema); `nextDue` is still derived per the recompute rule |
| Edit changes only `title`                                                      | `lastCompletedDate` and `nextDue` unchanged; `MaintenanceTaskUpdated` published              |
| Edit changes `intervalValue`/`intervalUnit`, task has a `lastCompletedDate`    | `nextDue` recomputed from `lastCompletedDate` + resulting interval                           |
| Edit changes `intervalValue`/`intervalUnit`, task has no `lastCompletedDate`   | `nextDue` recomputed from today's UTC date + resulting interval                              |
| Edit request's resulting values exactly match the task's current stored values | 200 with unchanged task; no `MaintenanceTaskUpdated` event published                         |
| Editing a task that doesn't exist                                              | 404                                                                                          |
| Editing a task that belongs to a different asset than the path `assetId`       | 404                                                                                          |
| Editing a task whose asset the requester cannot access                         | 403                                                                                          |
| Editing a task on an archived asset                                            | Permitted; 200                                                                               |
| 422 response with a known field name                                           | Banner shown; server error message pinned to the matching form field                         |
| 422 response without a field name                                              | Banner shown; no field highlighted                                                           |

## Telemetry

**Request telemetry:**

- `POST /api/assets/{assetId}/maintenance-tasks` → `CreateMaintenanceTask` operation
- `GET /api/assets/{assetId}/maintenance-tasks` → `ListMaintenanceTasks` operation
- `DELETE /api/assets/{assetId}/maintenance-tasks/{taskId}` → `DeleteMaintenanceTask` operation
- `PATCH /api/assets/{assetId}/maintenance-tasks/{taskId}` → `UpdateMaintenanceTask` operation

All four route patterns must be added to the operation name mapping in `technicalTelemetry.ts`. See [telemetry.md](../cross-cutting/telemetry.md) for the full request data point shape. The existing `POST /api/assets/{assetId}/maintenance-records` operation name (`CreateMaintenanceRecord`) is unchanged when `taskId` is added to the body.

**Domain events:** Four events are published to dataset `pineapple_maintenance_task_domain_events` (binding: `MAINTENANCE_TASK_DOMAIN_TELEMETRY`). None may include user-entered title text in telemetry blobs.

**Enriched event payload vs. telemetry blobs (Smart Events, [ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md)):** The blob tables below are the _thin telemetry projection_ written to Analytics Engine (IDs and enums only, no PII). The _event payload_ carried on the bus/queue to durable consumers is richer — it additionally carries the asset snapshot (`name`, `type`), the task `title`, the History `activityEntryType` conclusion, and, for `MaintenanceTaskCreated`, `MaintenanceTaskUpdated`, and `MaintenanceTaskAdvanced`, the resulting **`nextDue`** as a producer-owned conclusion. `nextDue` is required so the [notifications](./notifications.md) durable scheduler can schedule/reschedule a reminder **without reading maintenance-task storage back** (ADR-0010); `MaintenanceTaskDeleted` needs no `nextDue` (its consumer cancels). These payload fields are **not** added to the telemetry blobs, which stay PII-free. The full payload contract lives in [data-model.md](../../reference/data-model.md) (domain-events table). Implementation must populate `nextDue` where these events are constructed in the application layer, using the task's `nextDue` after creation, update, or advancement.

### `MaintenanceTaskCreated` — on successful task creation

| Field        | Name                   | Value                                                                                         |
| ------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| `indexes[0]` | —                      | `owner_id` (partition key for per-owner queries)                                              |
| `blobs[0]`   | `event_type`           | `"MaintenanceTaskCreated"`                                                                    |
| `blobs[1]`   | `aggregate_type`       | `"MaintenanceTask"`                                                                           |
| `blobs[2]`   | `maintenance_task_id`  | Task UUID                                                                                     |
| `blobs[3]`   | `asset_id`             | Asset UUID                                                                                    |
| `blobs[4]`   | `owner_id`             | Owner UUID                                                                                    |
| `blobs[5]`   | `actor_id`             | UUID of the authenticated user                                                                |
| `blobs[6]`   | `source_use_case`      | `"CreateMaintenanceTask"`                                                                     |
| `blobs[7]`   | `schema_version`       | `"v1"`                                                                                        |
| `blobs[8]`   | `result`               | `"success"`                                                                                   |
| `doubles[0]` | `count`                | Always `1`                                                                                    |
| `doubles[1]` | `event_time_ms`        | Event timestamp (ms since epoch)                                                              |
| `doubles[2]` | `interval_days_approx` | Interval normalized to approximate days for analytics (days×1, weeks×7, months×30, years×365) |

### `MaintenanceTaskUpdated` — on an edit that changes `title`, `intervalValue`, or `intervalUnit`

Published only when the edit's resulting values differ from the task's current stored values (mirrors `MaintenanceTaskAdvanced`'s guard). Not published for a no-op edit.

| Field        | Name                   | Value                                                                                                   |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `indexes[0]` | —                      | `owner_id` (partition key for per-owner queries)                                                        |
| `blobs[0]`   | `event_type`           | `"MaintenanceTaskUpdated"`                                                                              |
| `blobs[1]`   | `aggregate_type`       | `"MaintenanceTask"`                                                                                     |
| `blobs[2]`   | `maintenance_task_id`  | Task UUID                                                                                               |
| `blobs[3]`   | `asset_id`             | Asset UUID                                                                                              |
| `blobs[4]`   | `owner_id`             | Owner UUID                                                                                              |
| `blobs[5]`   | `actor_id`             | UUID of the authenticated user                                                                          |
| `blobs[6]`   | `source_use_case`      | `"UpdateMaintenanceTask"`                                                                               |
| `blobs[7]`   | `schema_version`       | `"v1"`                                                                                                  |
| `blobs[8]`   | `result`               | `"success"`                                                                                             |
| `doubles[0]` | `count`                | Always `1`                                                                                              |
| `doubles[1]` | `event_time_ms`        | Event timestamp (ms since epoch)                                                                        |
| `doubles[2]` | `interval_days_approx` | Resulting interval (post-edit) normalized to approximate days, same formula as `MaintenanceTaskCreated` |

### `MaintenanceTaskDeleted` — on successful task deletion

| Field        | Name                  | Value                            |
| ------------ | --------------------- | -------------------------------- |
| `indexes[0]` | —                     | `owner_id`                       |
| `blobs[0]`   | `event_type`          | `"MaintenanceTaskDeleted"`       |
| `blobs[1]`   | `aggregate_type`      | `"MaintenanceTask"`              |
| `blobs[2]`   | `maintenance_task_id` | Task UUID                        |
| `blobs[3]`   | `asset_id`            | Asset UUID                       |
| `blobs[4]`   | `owner_id`            | Owner UUID                       |
| `blobs[5]`   | `actor_id`            | UUID of the authenticated user   |
| `blobs[6]`   | `source_use_case`     | `"DeleteMaintenanceTask"`        |
| `blobs[7]`   | `schema_version`      | `"v1"`                           |
| `blobs[8]`   | `result`              | `"success"`                      |
| `doubles[0]` | `count`               | Always `1`                       |
| `doubles[1]` | `event_time_ms`       | Event timestamp (ms since epoch) |

### `MaintenanceTaskAdvanced` — when a linked record advances the task's `lastCompletedDate`

Published only when `record.performedAt > task.lastCompletedDate` (i.e. when `nextDue` actually changes). Not published when linking an older record.

| Field        | Name                    | Value                                                 |
| ------------ | ----------------------- | ----------------------------------------------------- |
| `indexes[0]` | —                       | `owner_id`                                            |
| `blobs[0]`   | `event_type`            | `"MaintenanceTaskAdvanced"`                           |
| `blobs[1]`   | `aggregate_type`        | `"MaintenanceTask"`                                   |
| `blobs[2]`   | `maintenance_task_id`   | Task UUID                                             |
| `blobs[3]`   | `asset_id`              | Asset UUID                                            |
| `blobs[4]`   | `owner_id`              | Owner UUID                                            |
| `blobs[5]`   | `actor_id`              | UUID of the authenticated user who logged the record  |
| `blobs[6]`   | `maintenance_record_id` | UUID of the linked maintenance record                 |
| `blobs[7]`   | `source_use_case`       | `"CreateMaintenanceRecord"`                           |
| `blobs[8]`   | `schema_version`        | `"v1"`                                                |
| `blobs[9]`   | `result`                | `"success"`                                           |
| `doubles[0]` | `count`                 | Always `1`                                            |
| `doubles[1]` | `event_time_ms`         | Event timestamp (ms since epoch)                      |
| `doubles[2]` | `performed_date_ms`     | `record.performedAt` at UTC midnight (ms since epoch) |

## Out of Scope

- Mileage/odometer-based intervals (Phase 2)
- Distance-based intervals must not be implemented by adding `"mile"` or `"hour"` to the time
  interval enum. Future distance/hour tasks need an explicit discriminator such as
  `type: "time" | "distance"` and separate fields like `lastCompletedOdometer` /
  `nextDueMileage`.
- Directly setting `lastCompletedDate` or `nextDue` via the edit endpoint — moving the schedule without evidence of completed work is "reschedule," a distinct concern tracked in #178 (snooze + reschedule); the boundary is deliberate so the two features don't collide
- UI entry points and post-creation navigation. This spec covers the API contract; asset detail
  placement, task list presentation, the "Log maintenance" shortcut, and inline/modal/drawer/route
  choices belong to a UI design pass.
- Dashboard-only detail fields such as estimated duration, location/where, assignee/vendor, and
  task notes. They are not part of the current maintenance-task contract and must be specified
  before the dashboard can render them from live API data.
- **Sending** reminders or push/email notifications — this feature does not deliver reminders; it
  publishes the task lifecycle events that the [notifications](./notifications.md) durable
  scheduler consumes
- A standalone schedule/task-management screen beyond the dashboard read model
- Archiving or disabling tasks directly (only hard delete in this iteration); task **suspension as a consequence of archiving the parent asset** — a task `active`/`suspended` status and `MaintenanceTaskSuspended`/`Reactivated` events — is a **parked** design in [backlog/archive-asset.md](../backlog/archive-asset.md), out of current scope
- Automatic record creation triggered by tasks
- Bulk task management
- Task templates or task categories

## Future Considerations

- A cross-cutting time spec should eventually define project-wide rules for date-only fields,
  timestamps, user time zones, server clock comparisons, and telemetry conversions. Until then,
  this spec's date-only arithmetic rules are authoritative for maintenance tasks.
