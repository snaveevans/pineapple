---
name: maintenance-task
description: Time-based recurring maintenance tasks tied to assets, with automatic next-due advancement when a linked maintenance record is logged
metadata:
  type: feature
---

# Maintenance Task

**Status:** draft
**Owner:** [unknown - assign on review]
**Last Updated:** 2026-06-17
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [maintenance-record.md](./maintenance-record.md), [dashboard.md](./dashboard.md)

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

## Acceptance Criteria

### Task creation

- [ ] A maintenance task is always tied to an existing asset owned by the authenticated user
- [ ] `POST /api/assets/{assetId}/maintenance-tasks` accepts `{ title, intervalValue, intervalUnit, lastCompletedDate? }` and returns the full created task with status 201
- [ ] `ownerId` is never accepted in the request body; it is derived from the authenticated session
- [ ] `title` is required and limited to 100 characters
- [ ] `intervalValue` is required and must be a positive integer (≥ 1)
- [ ] `intervalUnit` is required and must be one of `"day" | "week" | "month" | "year"`
- [ ] `lastCompletedDate` is optional; when provided it must be a valid YYYY-MM-DD date that is today or earlier
- [ ] When `lastCompletedDate` is provided, `nextDue = lastCompletedDate + interval` (calendar-based arithmetic)
- [ ] When `lastCompletedDate` is omitted, `nextDue = today (UTC calendar date) + interval`
- [ ] Creating a task for an archived asset returns 409
- [ ] The create use case checks that the target asset exists and belongs to the authenticated user before creating the task

### Task list

- [ ] `GET /api/assets/{assetId}/maintenance-tasks` returns `{ maintenanceTasks: [...] }` with status 200
- [ ] The list use case returns only tasks for an asset owned by the authenticated user
- [ ] Each task in the response includes `id`, `assetId`, `title`, `intervalValue`, `intervalUnit`, `lastCompletedDate` (nullable), `nextDue`, and `createdAt`; `ownerId` is never exposed
- [ ] Tasks are returned in ascending `nextDue` order (soonest due first)
- [ ] The dashboard's cross-asset queue is exposed through [dashboard.md](./dashboard.md), not by requiring the web app to call this asset-scoped endpoint once per asset

### Task deletion

- [ ] `DELETE /api/assets/{assetId}/maintenance-tasks/{taskId}` returns 204 on success
- [ ] Deleting a task that doesn't exist returns 404
- [ ] Deleting a task that belongs to another user returns 403
- [ ] Existing maintenance records previously linked to the deleted task are preserved with their `taskId` set to null

### Record-task linking (change to existing maintenance-record endpoint)

- [ ] `POST /api/assets/{assetId}/maintenance-records` accepts an optional `taskId` field in the request body
- [ ] When `taskId` is provided, it must reference a maintenance task belonging to the same asset; a task from a different asset returns 422
- [ ] When `taskId` references a task owned by a different user, 404 is returned (existence is not revealed)
- [ ] Maintenance record responses include a nullable `taskId` field
- [ ] When a linked record's `performedAt` is strictly greater than the task's current `lastCompletedDate` (or the task has no `lastCompletedDate`), the task's `lastCompletedDate` updates to `record.performedAt` and `nextDue` advances accordingly
- [ ] When a linked record's `performedAt` is earlier than the task's current `lastCompletedDate`, `lastCompletedDate` and `nextDue` are unchanged — linking an older record never regresses the next-due date
- [ ] Linking a record to a task for an archived asset returns 409 (the existing archived-asset rule for record creation applies)

### General

- [ ] A 401 response from the API redirects to `/login` through the API client layer
- [ ] A 403 response from asset or task ownership checks is shown as an access-denied error
- [ ] A 404 response is shown as a not-found error when the asset or task does not exist

## Validation & Ownership

**Authentication:** This feature is available only to authenticated users. API requests use the resolved `User.id` as `ownerId`.

**Permissions:** Tasks are owned through the asset they belong to. A user can create, list, and delete tasks only for assets they own. The client cannot supply `ownerId`.

**HTTP validation:** Inputs are validated at the Zod HTTP edge in `apps/api/src/api/schemas/maintenanceTaskSchemas.ts`. Required fields: `title` (string, max 100 chars), `intervalValue` (positive integer), `intervalUnit` (enum: `day | week | month | year`). Optional: `lastCompletedDate` (YYYY-MM-DD, today or earlier). For maintenance record creation, `taskId` is optional (UUID).

**Domain validation:** Domain construction trims title and preserves these invariants: non-empty title of at most 100 characters; positive integer interval value; valid interval unit; date-only `lastCompletedDate` of today or earlier when provided; `nextDue` always present and derived from `lastCompletedDate` (or today's UTC calendar date) + interval.

**Next-due arithmetic:** Interval arithmetic is calendar-based. "2 months from 2026-01-31" yields "2026-03-31"; if the resulting day exceeds the month length, clamp to the last day of that month. The implementation must not parse date strings through `Date` for calendar arithmetic; use manual calendar math or a WinterCG-compatible date library.

**Date-only mitigation:** Same convention as [maintenance-record.md](./maintenance-record.md). `lastCompletedDate` and `nextDue` are timezone-free YYYY-MM-DD strings across the API, domain, and D1 persistence. Today's UTC calendar date is authoritative for seeding and comparisons.

**Field errors:** Validation errors map back to `title`, `intervalValue`, `intervalUnit`, and `lastCompletedDate` when the backend includes a known `field` value.

## Edge Cases & Error States

| Scenario                                                               | Expected Behavior                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Asset has no maintenance tasks                                         | List returns `{ maintenanceTasks: [] }`                              |
| `title` is empty                                                       | 422; title field shows required-field error                          |
| `title` is over 100 characters                                         | 422; title field shows max-length error                              |
| `intervalValue` is 0 or negative                                       | 422; intervalValue field shows must-be-positive error                |
| `intervalValue` is not an integer                                      | 422; intervalValue field shows type error                            |
| `intervalUnit` is not a valid enum value                               | 422; intervalUnit field shows invalid-value error                    |
| `lastCompletedDate` is in the future                                   | 422; lastCompletedDate field shows "must be today or earlier" error  |
| `lastCompletedDate` is malformed                                       | 422; lastCompletedDate field shows format error                      |
| `lastCompletedDate` omitted                                            | `nextDue` seeded as today (UTC calendar date) + interval             |
| Asset is archived; task creation attempted                             | 409                                                                  |
| Asset is archived; task list requested                                 | Existing task list is returned normally                              |
| Asset is archived; record with `taskId` provided                       | 409 (archived-asset rule on record creation applies)                 |
| Linked record's `performedAt` equals task's `lastCompletedDate`        | `lastCompletedDate` and `nextDue` unchanged                          |
| Linked record's `performedAt` is older than task's `lastCompletedDate` | `lastCompletedDate` and `nextDue` unchanged                          |
| `taskId` in record creation belongs to a different asset (same user)   | 422; taskId field shows "task does not belong to this asset"         |
| `taskId` in record creation belongs to another user's task             | 404                                                                  |
| `taskId` in record creation references a non-existent task             | 404                                                                  |
| Task is deleted while it has linked records                            | 204; linked records preserved with `taskId` set to null              |
| Deleting a task that doesn't exist                                     | 404                                                                  |
| Deleting another user's task                                           | 403                                                                  |
| User lists tasks for another user's asset                              | 403                                                                  |
| User lists tasks for a non-existent asset                              | 404                                                                  |
| 422 response with a known field name                                   | Banner shown; server error message pinned to the matching form field |
| 422 response without a field name                                      | Banner shown; no field highlighted                                   |

## Telemetry

**Request telemetry:**

- `POST /api/assets/{assetId}/maintenance-tasks` → `CreateMaintenanceTask` operation
- `GET /api/assets/{assetId}/maintenance-tasks` → `ListMaintenanceTasks` operation
- `DELETE /api/assets/{assetId}/maintenance-tasks/{taskId}` → `DeleteMaintenanceTask` operation

All three route patterns must be added to the operation name mapping in `technicalTelemetry.ts`. See [telemetry.md](../cross-cutting/telemetry.md) for the full request data point shape. The existing `POST /api/assets/{assetId}/maintenance-records` operation name (`CreateMaintenanceRecord`) is unchanged when `taskId` is added to the body.

**Domain events:** Three events are published to dataset `pineapple_maintenance_task_domain_events` (binding: `MAINTENANCE_TASK_DOMAIN_TELEMETRY`). None may include user-entered title text in telemetry blobs.

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

## Flags

**NOT SPECIFIED — UI entry points and post-creation navigation:** This spec covers the API contract only. The exact UI entry points (asset detail page layout, task list placement, "Log maintenance" shortcut interaction, form presentation) are not specified here and should be addressed in a UI design pass.

**FOLLOW-UP NEEDED — Mileage-based intervals (Phase 2):** The original user stories include "change oil every 5,000 miles." Odometer tracking and mileage-based `nextDue` computation are out of scope for phase 1. When implementing, do NOT simply add `"mile"` to the `intervalUnit` enum — time tasks carry `lastCompletedDate`/`nextDue` (dates) while distance tasks would need `lastCompletedOdometer`/`nextDueMileage` (integers). Introduce a `type: "time" | "distance"` discriminator and treat them as two explicit shapes. Existing time-based tasks require no changes.

**FOLLOW-UP NEEDED — Dashboard detail fields:** The dashboard prototype displays estimated duration, location/where, assignee/vendor, and task notes. Those fields are not part of the current maintenance-task contract and must be specified here before the dashboard can render them from live API data.

**FOLLOW-UP NEEDED — Cross-cutting time spec:** Same flag as [maintenance-record.md](./maintenance-record.md). Date-only arithmetic for `nextDue` computation — especially month and year intervals — should be revisited when a cross-cutting time spec is authored.

## Out of Scope

- Mileage/odometer-based intervals (Phase 2)
- Editing a task's title or interval after creation
- Reminders and push/email notifications when maintenance is due
- A standalone schedule/task-management screen beyond the dashboard read model
- Archiving or disabling tasks (only hard delete is supported in this iteration)
- Automatic record creation triggered by tasks
- Bulk task management
- Task templates or task categories
