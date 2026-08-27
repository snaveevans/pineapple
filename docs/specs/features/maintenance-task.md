---
name: maintenance-task
description: Time-based recurring maintenance tasks tied to assets, with automatic next-due advancement when a linked maintenance record is logged
metadata:
  type: feature
---

# Maintenance Task

**Status:** in-progress
**Owner:** product and engineering
**Last Updated:** 2026-08-21
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [maintenance-record.md](./maintenance-record.md), [dashboard.md](./dashboard.md), [activity-history.md](./activity-history.md)

---

## Summary

The Maintenance Task feature lets an authenticated owner-operator define scheduled maintenance work for an asset — specifying what to do and how often (time-based interval) — so they always know when maintenance is next due. When a maintenance record is linked to a task at logging time, the task's next-due date automatically advances based on when the work was performed. If a linked record is later corrected or deleted, the task recomputes its completion state from an immutable creation seed and the remaining linked records. Tasks created after the schedule-seed migration restore from their original seed; legacy tasks restore from their deterministic backfilled baseline because historical provenance cannot be recovered. Tasks are the scheduling counterpart to the Maintenance Record log: records capture what _was_ done; tasks capture what _should_ be done and when.

## User Stories

- As an **authenticated user**, I can **create a time-based maintenance task for an asset I can access** so that **I know what recurring maintenance is scheduled and when it's next due**
- As **DIYer Dale**, I can **seed a new task with a last-completed date** so that **the next-due date reflects reality from the moment I create the task**
- As **DIYer Dale**, I can **create a "replace furnace filter every 2 months" task for my house without a last-completed date** so that **the system starts counting from today**
- As an **authenticated user**, I can **list the maintenance tasks for an asset I can access** so that **I can see all scheduled work and when each item is next due**
- As **DIYer Dale**, I can **link a maintenance record to a task when logging completed work** so that **the task's next-due date advances automatically to reflect the work I just performed**
- As **DIYer Dale**, I can **use a task's dedicated "Log maintenance" flow** so that **the record is pre-linked to the task without extra steps**
- As an **authenticated user**, I can **delete a maintenance task on an asset I can access** so that **stale or incorrect tasks don't clutter the asset**
- As a **user who deletes a task**, my **existing maintenance records are preserved** so that **my historical maintenance log is not lost**
- As an **authenticated user**, I can **edit a task's title or interval on an asset I can access** so that **I can correct a mistake without losing `lastCompletedDate` or churning the task's history the way delete-and-recreate does**
- As an **authenticated user**, I can **reschedule a task's current due date without logging maintenance** so that **a changed plan does not create false evidence that work occurred**
- As an **authenticated user correcting or deleting a linked record**, I can **trust the task's `lastCompletedDate` and `nextDue` to reflect the remaining evidence** so that **a record correction cannot leave the recurring schedule stale**

## Acceptance Criteria

<!-- These boxes are the live implementation checklist: check a box (`- [x]`) only when the
behavior is implemented AND covered by a test on `main`. Every criterion carries exactly one
slice tag (`S1`…) from the Delivery Plan below — so each box has a home and "slice done = its
tagged boxes are all `[x]`." See docs/specs/SPECS.md. -->

### Task creation

- [x] `S1` A maintenance task is always tied to an existing asset the authenticated requester can access
- [x] `S1` `POST /api/assets/{assetId}/maintenance-tasks` accepts `{ title, intervalValue, intervalUnit, lastCompletedDate? }` and returns the full created task with status 201
- [x] `S1` `ownerId` is never accepted in the request body; it is derived from the target asset, while the authenticated session supplies the actor/requester
- [x] `S1` `title` is required and limited to 100 characters
- [x] `S1` `intervalValue` is required and must be a positive integer (≥ 1)
- [x] `S1` `intervalUnit` is required and must be one of `"day" | "week" | "month" | "year"`
- [x] `S1` `lastCompletedDate` is optional; when provided it must be a valid YYYY-MM-DD date that is today or earlier
- [x] `S1` When `lastCompletedDate` is provided, `nextDue = lastCompletedDate + interval` (calendar-based arithmetic)
- [x] `S1` When `lastCompletedDate` is omitted, `nextDue = today (UTC calendar date) + interval`
- [x] `S1` Creating a task for an archived asset returns 409
- [x] `S1` The create use case checks that the target asset exists and the requester can access it before creating the task; the task's `ownerId` remains the asset owner

### Task list

- [x] `S1` `GET /api/assets/{assetId}/maintenance-tasks` returns `{ maintenanceTasks: [...] }` with status 200
- [x] `S1` The list use case returns only tasks for an asset the authenticated requester can access
- [x] `S1` Each task in the response includes `id`, `assetId`, `title`, `intervalValue`, `intervalUnit`, `lastCompletedDate` (nullable), `nextDue`, and `createdAt`; `ownerId` is never exposed
- [x] `S1` Tasks are returned in ascending `nextDue` order (soonest due first)
- [x] `S1` The dashboard's cross-asset queue is exposed through [dashboard.md](./dashboard.md), not by requiring the web app to call this asset-scoped endpoint once per asset

### Task deletion

- [x] `S1` `DELETE /api/assets/{assetId}/maintenance-tasks/{taskId}` returns 204 on success
- [x] `S1` Deleting a task that doesn't exist returns 404
- [x] `S1` Deleting a task whose asset the requester cannot access returns 403
- [x] `S1` Existing maintenance records previously linked to the deleted task are preserved with their `taskId` set to null
- [x] `S2` Deleting an existing task on an archived asset is permitted; archival blocks new maintenance activity, not mutation of an existing task

### Task edit

- [x] `S2` `PATCH /api/assets/{assetId}/maintenance-tasks/{taskId}` accepts `{ title?, intervalValue?, intervalUnit? }` and returns the full updated task with status 200
- [x] `S2` At least one of `title`, `intervalValue`, `intervalUnit` must be present in the request body; a body with none of them returns 422
- [x] `S2` `lastCompletedDate` and `nextDue` are not fields on this endpoint's request schema; the endpoint never accepts a direct override of either — `nextDue` is always derived (see recompute rule below)
- [x] `S2` `ownerId` is never accepted in the request body; it remains the target asset owner, while the authenticated session supplies the actor/requester
- [x] `S2` When provided, `title` follows the same validation as task creation (non-empty after trim, ≤100 characters)
- [x] `S2` When provided, `intervalValue` follows the same validation as task creation (positive integer ≥ 1)
- [x] `S2` When provided, `intervalUnit` follows the same validation as task creation (one of `day | week | month | year`)
- [x] `S2` A field omitted from the request body keeps its current stored value
- [ ] `S4` When the resulting `intervalValue` and/or `intervalUnit` differ from the task's current stored values, `nextDue` is recomputed as `(lastCompletedDate ?? scheduleSeedDate) + interval`, using the resulting `intervalValue`/`intervalUnit` and the same calendar arithmetic as task creation
- [x] `S2` When the resulting `intervalValue` and `intervalUnit` are unchanged from the task's current stored values — whether omitted from the request or resent unchanged — `lastCompletedDate` and `nextDue` are left unchanged; this holds even for a title-only edit on a task with no `lastCompletedDate`, where recomputing from `todayUtc` would otherwise silently push the schedule out
- [x] `S2` When the requested `title`, `intervalValue`, and `intervalUnit` (after applying only the provided fields) are identical to the task's current stored values at the optimistic-CAS linearization point, the edit is a no-op: the task is returned unchanged with status 200, and no `MaintenanceTaskUpdated` event is published; if the revision changes before that point, the operation retries against fresh state instead of returning a stale no-op
- [x] `S2` Editing or deleting a task on an archived asset is permitted — asset archival blocks new maintenance activity (creating tasks or records), not mutation of an existing task
- [x] `S2` Editing a task that doesn't exist returns 404
- [x] `S2` Editing a task that exists but belongs to a different asset than the path `assetId` returns 404
- [x] `S2` Editing a task whose asset the requester cannot access returns 403
- [x] `S2` The update use case checks that the target asset exists and the requester can access it before applying the edit, following the same task-then-asset-then-access order as task deletion (task lookup and asset-mismatch check first, then asset lookup, then the access check)
- [x] `S2` A successful edit that changes `title`, `intervalValue`, or `intervalUnit` publishes a `MaintenanceTaskUpdated` domain event carrying the resulting `nextDue` as a producer-owned conclusion (ADR-0010), so the notifications scheduler reschedules the pending reminder via its existing supersede path without reading task storage back
- [x] `S3` An editable task exposes an edit action that opens a form prefilled with its title and interval; the form never offers `lastCompletedDate` or `nextDue`
- [x] `S3` Saving the task submits the edit endpoint, updates the displayed task in place, and shows the existing access-denied / not-found treatment for 403/404 responses
- [ ] `S4` Task writes blocked by `maintenance_write_gate = frozen` return 503 with `maintenance_write_frozen`; the UI leaves the current data intact and shows a retryable state for the user

### Task reschedule

- [ ] `S5` `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/reschedule` accepts exactly `{ nextDue }` and returns the full rescheduled task with status 200
- [ ] `S5` The reschedule body is strict: `nextDue` must be a valid date-only `YYYY-MM-DD` value strictly after the server's `todayUtc`; today, past dates, and unknown fields return 422
- [ ] `S5` Rescheduling sets an internal nullable `nextDueOverride` to the requested target and makes the public `nextDue` equal that target; `lastCompletedDate`, `scheduleSeedDate`, and `initialLastCompletedDate` remain unchanged
- [ ] `S5` A request whose target already equals the current `nextDue` is a no-op: it returns the unchanged task with status 200 and neither creates an override nor publishes an event
- [ ] `S5` The next successful linked-record task advance clears `nextDueOverride` and derives `nextDue` from that record's `performedAt` plus the current interval; linking an older record that does not advance the task leaves the override intact
- [ ] `S5` An interval edit clears `nextDueOverride` and derives `nextDue` from `lastCompletedDate ?? scheduleSeedDate` plus the resulting interval; a title-only edit leaves the override and effective `nextDue` unchanged
- [ ] `S5` Record correction continues to recompute `lastCompletedDate` from evidence, but leaves a current `nextDueOverride` intact; the effective `nextDue` remains the override until it is cleared by interval edit or a successful task advance
- [ ] `S5` Rescheduling an existing task on an archived asset is permitted, matching task edit and deletion; new task and maintenance-record creation remain blocked on archived assets
- [ ] `S5` Rescheduling a missing task, a task under a different path asset, or a task on an inaccessible asset follows the same 404/404/403 semantics and task-then-asset-then-access ordering as task edit
- [ ] `S5` A successful reschedule increments the task revision and publishes a `MaintenanceTaskRescheduled` Smart Event carrying the resulting `nextDue`, task/asset snapshots, actor, and `task_rescheduled` History conclusion; durable consumers do not read task storage back
- [ ] `S5` The dashboard and asset maintenance page both expose a reschedule action with a future-date form; pending, 422, 403, 404, and 503 states preserve current task data, and success updates/invalidate both task-list and dashboard read models

### Record-task linking (change to existing maintenance-record endpoint)

- [x] `S1` `POST /api/assets/{assetId}/maintenance-records` accepts an optional `taskId` field in the request body
- [x] `S1` When `taskId` is provided, an accessible task from a different asset returns 422; an inaccessible foreign task returns 404, and a missing task returns 404
- [x] `S1` When `taskId` references a task on an asset the requester cannot access, 404 is returned (existence is not revealed); this is a foreign-reference validation exception, not a direct child-resource request, which follows the canonical 403 rule
- [x] `S1` Maintenance record responses include a nullable `taskId` field
- [x] `S1` When a linked record's `performedAt` is strictly greater than the task's current `lastCompletedDate` (or the task has no `lastCompletedDate`), the task's `lastCompletedDate` updates to `record.performedAt` and `nextDue` advances accordingly
- [x] `S1` When a linked record's `performedAt` is earlier than the task's current `lastCompletedDate`, `lastCompletedDate` and `nextDue` are unchanged — linking an older record never regresses the next-due date
- [x] `S1` Linking a record to a task for an archived path asset returns 409; an accessible foreign task returns 422 and an inaccessible foreign task returns 404 regardless of the foreign asset's archived state

### Record correction reconciliation

- [ ] `S4` A task stores an immutable internal `scheduleSeedDate`, set at creation to the supplied `lastCompletedDate` or today's UTC date when no completion date was supplied; it is not exposed in the API response
- [ ] `S4` A task preserves an internal nullable `initialLastCompletedDate` alongside `scheduleSeedDate`, so removing all linked records can restore both the original schedule and the original nullable completion state; neither field is exposed in the API response
- [ ] `S4` A new task starts with internal `revision = 0` and its create event carries `taskRevision = 0`; each later successful task-affecting mutation commits at prior revision + 1, including a title-only task edit
- [ ] `S4` Task deletion carries `taskRevision = prior revision + 1` on `MaintenanceTaskDeleted` immediately before removing the task row; the event revision remains available to durable consumers after deletion
- [ ] `S4` Task deletion snapshots every linked record id and revision, conditionally sets each linked record's `taskId` to `null` while incrementing that record's revision by one, and conditionally deletes the task at its expected revision in the same D1 transaction; a row-count mismatch on either the unlink or task delete is a conflict that retries the complete operation, never a partial success
- [ ] `S4` Existing tasks are backfilled by an idempotent deterministic migration: `scheduleSeedDate` is set from the stored `lastCompletedDate`, or the UTC calendar date of `createdAt` when that value is null; `initialLastCompletedDate` is set from the stored `lastCompletedDate`; `revision` is set to `0`; a validation query reports any remaining null seed or revision values, rerunning the migration is safe, and the new runtime does not silently synthesize a seed for an incomplete row
- [ ] `S4` Legacy rows use the current stored state as their baseline even when the original provenance is unknowable: a non-null stored `lastCompletedDate` becomes both the seed and the preserved initial completion, while a null stored value uses the creation date seed and a null initial completion
- [ ] `S4` The legacy backfill is documented as unable to recover an original manually supplied seed, or distinguish a linked-record completion from an original completion, when that provenance was replaced or absent before this feature shipped; legacy rows therefore do not receive historical rewind guarantees beyond the deterministic baseline
- [ ] `S4` After a linked record edit or deletion, `lastCompletedDate` is the latest date among the original completion seed and the remaining linked records; it is null only when neither exists
- [ ] `S4` After a linked record edit or deletion without a current override, `nextDue` is `addInterval(lastCompletedDate, interval)` when `lastCompletedDate` is non-null, otherwise `addInterval(scheduleSeedDate, interval)`
- [ ] `S4` A linked record older than the original completion seed does not regress `lastCompletedDate` or `nextDue`; when a task has no original completion seed, `lastCompletedDate` is the latest remaining linked record date, including when that date is earlier than `scheduleSeedDate`
- [ ] `S4` Editing only a linked record's title or notes does not change the task schedule
- [ ] `S4` Editing a linked record's performed date recomputes from the normalized edited record plus all other linked records, while deletion recomputes from all linked records except the deleted record, in one atomic application operation
- [ ] `S4` A change to either derived `lastCompletedDate` or `nextDue` caused by record correction publishes a `MaintenanceTaskReconciled` Smart Event carrying both resulting values, the source record id/use case, and the asset/task snapshot required by durable consumers
- [ ] `S4` Every mutation that changes stored task state increments an internal per-task `revision` in the same transaction and carries the resulting revision on its task event; this covers task creation (`0`), record creation that advances a task, task edits (including title-only edits), record corrections that change derived task state, and task deletion
- [ ] `S4` `MaintenanceTaskReconciled` uses the existing notification supersede/reschedule path without requiring the notifications consumer to read maintenance-task storage back; when `nextDue` is unchanged, ingestion creates no new cycle or fire-status change and, if the winning cycle is pending, replaces its snapshot and order marker, otherwise leaves the cycle row unchanged
- [ ] `S4` A record correction that leaves both derived `lastCompletedDate` and `nextDue` unchanged does not publish a task reconciliation event, although the record update/delete event is still published; the record mutation still uses its own revision CAS
- [ ] `S4` A record correction never publishes `MaintenanceTaskAdvanced`, `MaintenanceRecordCreated`, `MaintenanceTaskUpdated`, or a new `task_completed` History entry
- [ ] `S4` If reconciliation returns a previously seen `nextDue`, notifications reuses or reactivates an unfired cycle and never creates a duplicate notification for a cycle that already fired

### General

- [x] `S1` A 401 response from the API redirects to `/login` through the API client layer
- [x] `S1` A 403 response from asset-access checks is shown as an access-denied error
- [x] `S1` A 404 response is shown as a not-found error when the asset or task does not exist
- [x] `S3` A 403/404 response from a task edit is shown using the same access-denied / not-found treatment as the rest of this feature

## Delivery Plan

| Slice | Scope                                                                                                                                                                                    | Issue                                                      | Depends on       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------- |
| `S1`  | Task creation, listing, deletion, and record-task linking (already shipped)                                                                                                              | —                                                          | —                |
| `S2`  | Task-edit backend: `PATCH` for `title`/`intervalValue`/`intervalUnit`, recomputed `nextDue`, and a `MaintenanceTaskUpdated` Smart Event                                                  | #180                                                       | `S1`             |
| `S3`  | Task-edit UI: prefilled title/interval form that updates the task in place without exposing schedule baselines                                                                           | #180                                                       | `S2`             |
| `S4`  | Record edit/delete reconciliation: immutable schedule seed, task recomputation, correction events, and notification rescheduling                                                         | [#181](https://github.com/snaveevans/pineapple/issues/181) | `S1`, `S2`       |
| `S5`  | One-cycle rescheduling: future-only schedule override, correction-aware lifecycle, `MaintenanceTaskRescheduled`, History entry, notification supersede, and dashboard/asset-page actions | [#235](https://github.com/snaveevans/pineapple/issues/235) | `S2`, `S3`, `S4` |

## Validation & Ownership

**Authentication:** This feature is available only to authenticated users. API requests use the resolved `User.id` as `requesterId`; `ownerId` remains the asset owner's domain id.

**Permissions:** Tasks are owned through the asset they belong to. A user can list, edit, reschedule, and delete existing tasks for assets they own or that are shared with their team, including archived assets; creating a task is limited to active assets. The client cannot supply `ownerId`. Direct requests for an existing inaccessible task return 403; the `taskId` foreign-reference check during record creation is the explicit 404 exception documented above.

**HTTP validation:** Inputs are validated at the Zod HTTP edge in `apps/api/src/api/schemas/maintenanceTaskSchemas.ts`. Required fields (create): `title` (string, max 100 chars), `intervalValue` (positive integer), `intervalUnit` (enum: `day | week | month | year`). Optional (create): `lastCompletedDate` (YYYY-MM-DD, today or earlier). For maintenance record creation, `taskId` is optional (UUID). The edit (`PATCH`) schema makes `title`, `intervalValue`, and `intervalUnit` all optional but validated with the same per-field rules as create when present, and refines that at least one of the three must be supplied. Reschedule (`POST .../reschedule`) accepts only `nextDue`, a valid date-only value strictly after `todayUtc`. Every schema is strict: omitted action fields and unknown keys return 422 rather than being stripped or applied.

**Domain validation:** Domain construction trims title and preserves these invariants: non-empty title of at most 100 characters; positive integer interval value; valid interval unit; date-only `lastCompletedDate` of today or earlier when provided; immutable internal `scheduleSeedDate`; nullable internal `initialLastCompletedDate`; nullable internal `nextDueOverride`; and an always-present effective `nextDue`. At creation, `scheduleSeedDate` is the supplied `lastCompletedDate` or today's UTC calendar date when no completion date is supplied, while `initialLastCompletedDate` is the supplied value or null. Rescheduling changes only `nextDueOverride` and the effective due date; it never manufactures a completion. Editing and record reconciliation reuse the same invariants — an edit cannot leave the task in a state creation itself couldn't produce. Archive state is checked by operation: create rejects archived assets with 409, while edits, reschedules, and deletes of existing tasks remain permitted.

**Next-due arithmetic:** Interval arithmetic is calendar-based. "2 months from 2026-01-31" yields "2026-03-31"; if the resulting day exceeds the month length, clamp to the last day of that month. The implementation must not parse date strings through `Date` for calendar arithmetic; use manual calendar math or a WinterCG-compatible date library. Editing must reuse this same `addInterval` implementation, not a second one.

**Edit recompute rule:** An edit whose resulting `intervalValue`/`intervalUnit` differ from the task's current stored values clears any `nextDueOverride` and recomputes `nextDue = addInterval(lastCompletedDate ?? scheduleSeedDate, resultingIntervalValue, resultingIntervalUnit)` — the identical formula task creation uses, just with the task's current `lastCompletedDate` (if any) as the baseline instead of a client-supplied one. The recompute is gated on the _resulting_ value actually differing from what's stored, not merely on whether the request includes the field — a client that resends the current interval alongside an unrelated title change (e.g. a form that always submits its full state) must not shift `nextDue` as a side effect. This keeps an uncompleted task anchored to its creation seed instead of silently moving the schedule forward as time passes. A title-only edit leaves a current override intact.

**Task mutation concurrency:** Task interval edits, reschedules, record corrections, and task deletion use optimistic concurrency on an internal per-task `revision`, initialized to `0`. The application reads the task and related records, computes the complete resulting state, and conditionally commits the task mutation, record mutation/unlink, and outbox rows only when the read revision is still current. A failed conditional write retries the complete operation against fresh state after the initial attempt, up to three additional attempts; the fourth conflict returns 409 and rolls back the entire operation. Validation, 404, archive, and no-op outcomes are not retried. The resulting revision is carried on the task event so notification and other durable consumers order events by `(taskRevision, kind, lowercase(eventId))` rather than arrival order. If task deletion wins a race with a record correction, the task's record links are null in the retry's current state and the correction proceeds as an unlinked-record edit without producing a task reconciliation event. If an interval edit and record correction race, the later retry applies its change to the latest task interval and completion state, so neither committed change is lost. If a reschedule races with a record correction, the later retry retains the reschedule override while applying the corrected completion state; if it races with an interval edit, the later retry follows the interval edit's override-clearing rule. If task edit or reschedule commits before task deletion, deletion reads that mutation and emits the terminal delete at the next revision; if deletion commits first, the other mutation retry returns 404. If record deletion wins before a correction retry, the correction returns 404; if task deletion wins first, the record correction follows the unlinked-record rule.

**Record-correction recompute rule:** When a linked record is edited, the application applies the normalized edit and loads that edited record plus all other records still linked to the task. When a record is deleted, the deleted record is excluded and all other linked records are loaded. `lastCompletedDate` becomes the latest of the immutable initial completion date, if one was supplied at task creation, and the post-mutation linked records' `performedAt` values. If neither exists, `lastCompletedDate` is null. Without an override, `nextDue` is then `addInterval(lastCompletedDate, interval)` when `lastCompletedDate` is non-null, or `addInterval(scheduleSeedDate, interval)` when it is null. With a current `nextDueOverride`, that override remains the effective `nextDue`; correction does not erase a deliberate current-cycle schedule change. A linked record older than an initial completion date is retained as history but does not regress the task. When no initial completion date exists, the latest remaining linked record date is the task's `lastCompletedDate`, even when it is earlier than `scheduleSeedDate`.

**Date-only mitigation:** Same convention as [maintenance-record.md](./maintenance-record.md). `scheduleSeedDate`, `lastCompletedDate`, and `nextDue` are timezone-free YYYY-MM-DD strings across the API, domain, and D1 persistence. Today's UTC calendar date is authoritative for initial seeding and comparisons; record reconciliation never uses the current date as a fallback when a task's stored seed is available.

**Field errors:** Validation errors map back to `title`, `intervalValue`, `intervalUnit`, `lastCompletedDate`, and `nextDue` when the backend includes a known `field` value.

## Edge Cases & Error States

| Scenario                                                                          | Expected Behavior                                                                                                                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Asset has no maintenance tasks                                                    | List returns `{ maintenanceTasks: [] }`                                                                                                                                              |
| `title` is empty                                                                  | 422; title field shows required-field error                                                                                                                                          |
| `title` is over 100 characters                                                    | 422; title field shows max-length error                                                                                                                                              |
| `intervalValue` is 0 or negative                                                  | 422; intervalValue field shows must-be-positive error                                                                                                                                |
| `intervalValue` is not an integer                                                 | 422; intervalValue field shows type error                                                                                                                                            |
| `intervalUnit` is not a valid enum value                                          | 422; intervalUnit field shows invalid-value error                                                                                                                                    |
| `lastCompletedDate` is in the future                                              | 422; lastCompletedDate field shows "must be today or earlier" error                                                                                                                  |
| `lastCompletedDate` is malformed                                                  | 422; lastCompletedDate field shows format error                                                                                                                                      |
| `lastCompletedDate` omitted                                                       | `nextDue` seeded as today (UTC calendar date) + interval                                                                                                                             |
| Asset is archived; task creation attempted                                        | 409                                                                                                                                                                                  |
| Asset is archived; task list requested                                            | Existing task list is returned normally                                                                                                                                              |
| Asset is archived; existing task edited or deleted                                | Mutation is permitted; archival blocks only new tasks/records and record corrections                                                                                                 |
| Asset is archived; existing task rescheduled                                      | Permitted; 200, matching edit/delete semantics                                                                                                                                       |
| Asset is archived; record with `taskId` provided                                  | 409 (archived-asset rule on record creation applies)                                                                                                                                 |
| Linked record's `performedAt` equals task's `lastCompletedDate`                   | `lastCompletedDate` and `nextDue` unchanged                                                                                                                                          |
| Linked record's `performedAt` is older than task's `lastCompletedDate`            | `lastCompletedDate` and `nextDue` unchanged                                                                                                                                          |
| `taskId` in record creation belongs to a different asset (same user)              | 422; taskId field shows "task does not belong to this asset"                                                                                                                         |
| `taskId` in record creation references a task on an inaccessible asset            | 404; deliberate foreign-reference exception to direct-resource 403                                                                                                                   |
| `taskId` in record creation references a non-existent task                        | 404                                                                                                                                                                                  |
| Task is deleted while it has linked records                                       | 204; linked records preserved with `taskId` set to null                                                                                                                              |
| Deleting a task that doesn't exist                                                | 404                                                                                                                                                                                  |
| Deleting a task on an inaccessible asset                                          | 403                                                                                                                                                                                  |
| User lists tasks for an inaccessible asset                                        | 403                                                                                                                                                                                  |
| User lists tasks for a non-existent asset                                         | 404                                                                                                                                                                                  |
| PATCH body has none of `title`, `intervalValue`, `intervalUnit`                   | 422; banner shown, no field highlighted                                                                                                                                              |
| PATCH `title` present but empty/whitespace-only                                   | 422; title field shows required-field error                                                                                                                                          |
| PATCH `title` exceeds 100 characters                                              | 422; title field shows max-length error                                                                                                                                              |
| PATCH `intervalValue` is 0, negative, or non-integer                              | 422; intervalValue field shows validation error                                                                                                                                      |
| PATCH `intervalUnit` is not `day`/`week`/`month`/`year`                           | 422; intervalUnit field shows invalid-value error                                                                                                                                    |
| PATCH body includes `lastCompletedDate`, `nextDue`, or any unknown key            | 422; no mutation or event is produced                                                                                                                                                |
| Edit changes only `title`                                                         | `lastCompletedDate` and `nextDue` unchanged; `MaintenanceTaskUpdated` published                                                                                                      |
| Edit changes `intervalValue`/`intervalUnit`, task has a `lastCompletedDate`       | `nextDue` recomputed from `lastCompletedDate` + resulting interval                                                                                                                   |
| Edit changes `intervalValue`/`intervalUnit`, task has no `lastCompletedDate`      | `nextDue` recomputed from `scheduleSeedDate` + resulting interval                                                                                                                    |
| Reschedule target is malformed, today, or in the past                             | 422; `nextDue` field shows the validation error; no task mutation or event                                                                                                           |
| Reschedule target equals current `nextDue`                                        | 200 with unchanged task; no override or `MaintenanceTaskRescheduled` event                                                                                                           |
| Reschedule target is future                                                       | `lastCompletedDate` is unchanged; `nextDueOverride` and effective `nextDue` become target; `MaintenanceTaskRescheduled` publishes                                                    |
| Linked record advances a task with an override                                    | Override clears; `lastCompletedDate` becomes `performedAt`; `nextDue` is `performedAt + interval`                                                                                    |
| Interval edit changes a task with an override                                     | Override clears; `nextDue` recomputes from the completion/seed baseline and resulting interval                                                                                       |
| Record correction changes completion state with an override                       | Completion state is reconciled but effective `nextDue` remains the override                                                                                                          |
| Edit request's resulting values exactly match the task's current stored values    | 200 with unchanged task; no `MaintenanceTaskUpdated` event published                                                                                                                 |
| Editing a task that doesn't exist                                                 | 404                                                                                                                                                                                  |
| Editing a task that belongs to a different asset than the path `assetId`          | 404                                                                                                                                                                                  |
| Editing a task whose asset the requester cannot access                            | 403                                                                                                                                                                                  |
| Editing a task on an archived asset                                               | Permitted; 200                                                                                                                                                                       |
| Edit changes only a linked record's title or notes                                | Task schedule unchanged; record update event only                                                                                                                                    |
| Edit changes a linked record's performed date                                     | Task recomputed from initial completion seed plus all remaining linked records                                                                                                       |
| Delete removes a non-latest linked record                                         | Task keeps the latest surviving completion and next due date                                                                                                                         |
| Delete removes the latest linked record                                           | Task rewinds to the latest remaining completion or its original seed                                                                                                                 |
| Delete removes the only linked record from a task with no initial completion date | `lastCompletedDate` becomes null; `nextDue` uses `scheduleSeedDate`                                                                                                                  |
| Record correction leaves the task schedule unchanged                              | No `MaintenanceTaskReconciled` event; record correction event still publishes                                                                                                        |
| A task predates the schedule-seed migration                                       | Deterministic seed, initial completion, and revision are backfilled from current state; a linked record becomes an indistinguishable legacy baseline and is not historically rewound |
| Runtime reads a null seed or revision after rollout                               | Invariant failure is logged/observable and returns 500; no current-date fallback or partial mutation                                                                                 |
| Task edit races with task deletion                                                | The first committed operation wins its revision; the second retries against it, then either deletes the latest task or returns 404 after deletion                                    |
| 422 response with a known field name                                              | Banner shown; server error message pinned to the matching form field                                                                                                                 |
| 422 response without a field name                                                 | Banner shown; no field highlighted                                                                                                                                                   |

## Telemetry

**Request telemetry:**

- `POST /api/assets/{assetId}/maintenance-tasks` → `CreateMaintenanceTask` operation
- `GET /api/assets/{assetId}/maintenance-tasks` → `ListMaintenanceTasks` operation
- `DELETE /api/assets/{assetId}/maintenance-tasks/{taskId}` → `DeleteMaintenanceTask` operation
- `PATCH /api/assets/{assetId}/maintenance-tasks/{taskId}` → `UpdateMaintenanceTask` operation
- `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/reschedule` → `RescheduleMaintenanceTask` operation

All five route patterns must be added to the operation name mapping in `technicalTelemetry.ts`. See [telemetry.md](../cross-cutting/telemetry.md) for the full request data point shape. The existing `POST /api/assets/{assetId}/maintenance-records` operation name (`CreateMaintenanceRecord`) is unchanged when `taskId` is added to the body.

**Domain events:** Five events are published to dataset `pineapple_maintenance_task_domain_events` (binding: `MAINTENANCE_TASK_DOMAIN_TELEMETRY`). `S5` adds a sixth, `MaintenanceTaskRescheduled`. None may include user-entered title text in telemetry blobs.

**Enriched event payload vs. telemetry blobs (Smart Events, [ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md)):** The blob tables below are the _thin telemetry projection_ written to Analytics Engine (IDs and enums only, no PII). The _event payload_ carried on the bus/queue to durable consumers is richer — it additionally carries `kind = real`, the asset snapshot (`name`, `type`), the task `title`, the History `activityEntryType` conclusion, the resulting internal **`taskRevision`**, and the resulting **`nextDue`** as a producer-owned conclusion. `MaintenanceTaskCreated`, `MaintenanceTaskUpdated`, `MaintenanceTaskAdvanced`, and `MaintenanceTaskReconciled` additionally carry the resulting **`lastCompletedDate`**; rescheduling does not change completion evidence, so `MaintenanceTaskRescheduled` carries only its resulting `nextDue`. `MaintenanceTaskReconciled.activityEntryType` is always `null`; it is a notification/scheduling conclusion and History ignores it. `nextDue` is required so the [notifications](./notifications.md) durable scheduler can schedule/reschedule a reminder **without reading maintenance-task storage back** (ADR-0010); `MaintenanceTaskDeleted` needs no `nextDue` (its consumer cancels). These payload fields are **not** added to the telemetry blobs, which stay PII-free. The full payload contract for existing events lives in [data-model.md](../../reference/data-model.md) (domain-events table); `S5` must add its reschedule payload there when implemented. Implementation must populate the schedule conclusions where these events are constructed in the application layer, using the task state after creation, update, reschedule, advancement, or record reconciliation.

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

### `MaintenanceTaskRescheduled` — on a future due-date override

Published only when the requested target differs from the task's current effective `nextDue`.

| Field        | Name                  | Value                              |
| ------------ | --------------------- | ---------------------------------- |
| `indexes[0]` | —                     | `owner_id`                         |
| `blobs[0]`   | `event_type`          | `"MaintenanceTaskRescheduled"`     |
| `blobs[1]`   | `aggregate_type`      | `"MaintenanceTask"`                |
| `blobs[2]`   | `maintenance_task_id` | Task UUID                          |
| `blobs[3]`   | `asset_id`            | Asset UUID                         |
| `blobs[4]`   | `owner_id`            | Owner UUID                         |
| `blobs[5]`   | `actor_id`            | UUID of the authenticated user     |
| `blobs[6]`   | `source_use_case`     | `"RescheduleMaintenanceTask"`      |
| `blobs[7]`   | `schema_version`      | `"v1"`                             |
| `blobs[8]`   | `result`              | `"success"`                        |
| `doubles[0]` | `count`               | Always `1`                         |
| `doubles[1]` | `event_time_ms`       | Event timestamp (ms since epoch)   |
| `doubles[2]` | `next_due_date_ms`    | Resulting next due at UTC midnight |

### `MaintenanceTaskDeleted` — on successful task deletion

The domain event (separate from the telemetry data point below) carries the task snapshot,
`taskRevision = prior revision + 1`, and the ordered `unlinkedRecordIds` captured by the same
transaction. The implicit record unlinks increment each record revision but do not emit
`MaintenanceRecordUpdated` correction events; the task-deletion event is the single user action
and the record rows remain preserved with `taskId = null`.

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

### `MaintenanceTaskReconciled` - when a record edit or deletion changes task schedule

Published only when linked-record correction changes the task's derived `lastCompletedDate` or
`nextDue`. It is not a completion event and does not create a `task_completed` History entry.

| Field        | Name                     | Value                                                           |
| ------------ | ------------------------ | --------------------------------------------------------------- |
| `indexes[0]` | -                        | `owner_id`                                                      |
| `blobs[0]`   | `event_type`             | `"MaintenanceTaskReconciled"`                                   |
| `blobs[1]`   | `aggregate_type`         | `"MaintenanceTask"`                                             |
| `blobs[2]`   | `maintenance_task_id`    | Task UUID                                                       |
| `blobs[3]`   | `asset_id`               | Asset UUID                                                      |
| `blobs[4]`   | `owner_id`               | Owner UUID                                                      |
| `blobs[5]`   | `actor_id`               | Actor UUID                                                      |
| `blobs[6]`   | `maintenance_record_id`  | Source record UUID                                              |
| `blobs[7]`   | `source_use_case`        | `"UpdateMaintenanceRecord"` or `"DeleteMaintenanceRecord"`      |
| `blobs[8]`   | `schema_version`         | `"v1"`                                                          |
| `blobs[9]`   | `result`                 | `"success"`                                                     |
| `doubles[0]` | `count`                  | Always `1`                                                      |
| `doubles[1]` | `event_time_ms`          | Event timestamp (ms since epoch)                                |
| `doubles[2]` | `last_completed_date_ms` | Resulting `lastCompletedDate` at UTC midnight, or `0` when null |

## Implementation Requirements

- Add the immutable schedule fields, task `revision`, record `revision`, and internal `legacy_baseline_pending` and `legacy_revision_pending` discriminators through the expand/contract migration policy in [schema-migrations.md](../cross-cutting/schema-migrations.md): introduce nullable columns with both discriminators `DEFAULT 1` plus `AFTER INSERT` compatibility triggers for rows inserted by the still-running old Worker. The new writer explicitly supplies all new fields and both discriminators as `0`. The task trigger runs only when `legacy_baseline_pending = 1`, fills (`scheduleSeedDate = COALESCE(lastCompletedDate, date(createdAt))`, `initialLastCompletedDate = lastCompletedDate`, `revision = 0`), then sets the discriminator to `0`; the record trigger does the same for `revision = 0` and `legacy_revision_pending`. Neither trigger has an UPDATE path or overwrites a backfilled seed, a deliberately null `initialLastCompletedDate`, or a non-null revision. The backfill sets both discriminators to `0` for existing rows after populating them. Then run the deterministic idempotent backfill and the exact seven-column validation query below. The deploy workflow must stop before `wrangler deploy` unless every gate count is zero; the triggers remain until the new writer is live and are removed only in a later contract migration. A failed or interrupted backfill blocks promotion, is visible through this query, and is safe to rerun; application code must not invent a new current-date seed at runtime. A task with no initial completion date is still seeded and is not a null-seed task.
- Add nullable `next_due_override` through the expand/contract policy in [schema-migrations.md](../cross-cutting/schema-migrations.md). Existing rows and old writers use `NULL`; no backfill is required. The new writer persists the future target on reschedule and clears it on interval edit or a successful task advance. No code may infer an override from a matching `next_due` value.
- Reconciliation must load the linked records needed to derive the task state and persist the record, task, and producer-side outbox rows atomically.
- The record correction use cases must not make notification or History consumers read maintenance-task or maintenance-record storage back; Smart Event payloads carry the required snapshots and schedule conclusions.
- The migration sequence is fixed and uses new files only: `0017_maintenance_seed_revision_expand.sql` adds the nullable task/record columns, `DEFAULT 1` legacy discriminators, insert compatibility triggers, and the singleton `maintenance_write_gate`; `0018_maintenance_seed_revision_backfill.sql` performs the deterministic existing-row backfill and leaves the triggers installed; `0019_activity_history_correction_types.sql` widens the History constraint and adds `audit_snapshot_json` using the approved SQLite rebuild in [schema-migrations.md](../cross-cutting/schema-migrations.md); `0020_notification_heads_email_claims.sql` adds notification task heads, sweep-run identity/items, email batch and outbox claim/retry columns, rebuilds `notification_email_outbox` to permit `pending | sending | sent | failed` while preserving existing rows/keys/indexes, adds the notification DLQ key, anomaly storage, and the required indexes; `0021_notification_scheduler_bootstrap.sql` performs the idempotent head/cycle bootstrap. If another migration lands first, preserve this order and use the next available sequential numbers rather than editing an applied file.
- The migration/deploy command sequence is: `pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations apply pineapple --remote`; then `pnpm --filter @snaveevans/pineapple-api wrangler d1 execute pineapple --remote --command "$MAINTENANCE_SCHEMA_VALIDATION_SQL" --json`; then `pnpm --filter @snaveevans/pineapple-api wrangler d1 execute pineapple --remote --command "$NOTIFICATION_BOOTSTRAP_VALIDATION_SQL" --json`; `pnpm --filter @snaveevans/pineapple-api wrangler deploy` is permitted only after both validation commands pass. The workflow parses each single result row and exits nonzero for malformed output, any null task seed/revision, any null record revision, any pending compatibility flag, any unresolved notification migration anomaly, any invalid active head, any incomplete sweep run, any new correction entry with a null/invalid audit snapshot, or any migration command failure. The activity rebuild itself aborts and rolls back on any row-count/index/FK preservation mismatch. The validation runs after migrations and before queue reconciliation or Worker deployment.
- `MAINTENANCE_SCHEMA_VALIDATION_SQL` is exactly:

  ```sql
  SELECT
    (SELECT COUNT(*) FROM maintenance_tasks WHERE schedule_seed_date IS NULL OR revision IS NULL) AS invalid_tasks,
    (SELECT COUNT(*) FROM maintenance_records WHERE revision IS NULL) AS invalid_records,
    (SELECT COUNT(*) FROM maintenance_tasks WHERE legacy_baseline_pending IS NULL OR legacy_baseline_pending <> 0) AS pending_task_compatibility_flags,
    (SELECT COUNT(*) FROM maintenance_records WHERE legacy_revision_pending IS NULL OR legacy_revision_pending <> 0) AS pending_record_compatibility_flags,
    (SELECT COUNT(*) FROM notification_migration_anomalies WHERE resolved_at IS NULL) AS notification_anomalies,
    (SELECT COUNT(*) FROM activity_entries WHERE type IN ('maintenance_record_updated', 'maintenance_record_deleted') AND (
      json_valid(audit_snapshot_json) <> 1 OR
      COALESCE(json_type(audit_snapshot_json), 'missing') <> 'object' OR
      COALESCE(json_type(audit_snapshot_json, '$.recordId'), 'missing') <> 'text' OR
      (json_type(audit_snapshot_json, '$.recordId') = 'text' AND (
        length(json_extract(audit_snapshot_json, '$.recordId')) <> 36 OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 9, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 14, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 19, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 24, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 1, 8) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 10, 4) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 15, 4) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 20, 4) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.recordId'), 25, 12) GLOB '*[^0-9A-Fa-f]*')) OR
      COALESCE(json_type(audit_snapshot_json, '$.taskId'), 'missing') NOT IN ('text', 'null') OR
      (json_type(audit_snapshot_json, '$.taskId') = 'text' AND (
        length(json_extract(audit_snapshot_json, '$.taskId')) <> 36 OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 9, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 14, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 19, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 24, 1) <> '-' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 1, 8) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 10, 4) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 15, 4) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 20, 4) GLOB '*[^0-9A-Fa-f]*' OR
        substr(json_extract(audit_snapshot_json, '$.taskId'), 25, 12) GLOB '*[^0-9A-Fa-f]*')) OR
      COALESCE(json_type(audit_snapshot_json, '$.createdAt'), 'missing') <> 'text' OR
      (json_type(audit_snapshot_json, '$.createdAt') = 'text' AND (
        length(json_extract(audit_snapshot_json, '$.createdAt')) <> 24 OR
        json_extract(audit_snapshot_json, '$.createdAt') NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' OR
        COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(audit_snapshot_json, '$.createdAt')), 'invalid') <> json_extract(audit_snapshot_json, '$.createdAt')) OR
      EXISTS (SELECT 1 FROM json_each(audit_snapshot_json) GROUP BY key HAVING COUNT(*) > 1) OR
      (type = 'maintenance_record_updated' AND (
        COALESCE(json_type(audit_snapshot_json, '$.before'), 'missing') <> 'object' OR
        COALESCE(json_type(audit_snapshot_json, '$.after'), 'missing') <> 'object' OR
        COALESCE(json_type(audit_snapshot_json, '$.before.title'), 'missing') <> 'text' OR
        trim(json_extract(audit_snapshot_json, '$.before.title')) = '' OR
        json_extract(audit_snapshot_json, '$.before.title') <> trim(json_extract(audit_snapshot_json, '$.before.title')) OR
        length(json_extract(audit_snapshot_json, '$.before.title')) > 100 OR
        COALESCE(json_type(audit_snapshot_json, '$.before.performedAt'), 'missing') <> 'text' OR
        length(json_extract(audit_snapshot_json, '$.before.performedAt')) <> 10 OR
        json_extract(audit_snapshot_json, '$.before.performedAt') NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
        COALESCE(date(json_extract(audit_snapshot_json, '$.before.performedAt')), 'invalid') <> json_extract(audit_snapshot_json, '$.before.performedAt') OR
        COALESCE(json_type(audit_snapshot_json, '$.before.notes'), 'missing') NOT IN ('text', 'null') OR
        (json_type(audit_snapshot_json, '$.before.notes') = 'text' AND (trim(json_extract(audit_snapshot_json, '$.before.notes')) = '' OR json_extract(audit_snapshot_json, '$.before.notes') <> trim(json_extract(audit_snapshot_json, '$.before.notes')) OR length(json_extract(audit_snapshot_json, '$.before.notes')) > 1000)) OR
        COALESCE(json_type(audit_snapshot_json, '$.after.title'), 'missing') <> 'text' OR
        trim(json_extract(audit_snapshot_json, '$.after.title')) = '' OR
        json_extract(audit_snapshot_json, '$.after.title') <> trim(json_extract(audit_snapshot_json, '$.after.title')) OR
        length(json_extract(audit_snapshot_json, '$.after.title')) > 100 OR
        COALESCE(json_type(audit_snapshot_json, '$.after.performedAt'), 'missing') <> 'text' OR
        length(json_extract(audit_snapshot_json, '$.after.performedAt')) <> 10 OR
        json_extract(audit_snapshot_json, '$.after.performedAt') NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
        COALESCE(date(json_extract(audit_snapshot_json, '$.after.performedAt')), 'invalid') <> json_extract(audit_snapshot_json, '$.after.performedAt') OR
        COALESCE(json_type(audit_snapshot_json, '$.after.notes'), 'missing') NOT IN ('text', 'null') OR
        (json_type(audit_snapshot_json, '$.after.notes') = 'text' AND (trim(json_extract(audit_snapshot_json, '$.after.notes')) = '' OR json_extract(audit_snapshot_json, '$.after.notes') <> trim(json_extract(audit_snapshot_json, '$.after.notes')) OR length(json_extract(audit_snapshot_json, '$.after.notes')) > 1000)) OR
        EXISTS (SELECT 1 FROM json_each(json_extract(audit_snapshot_json, '$.before')) WHERE key NOT IN ('title', 'performedAt', 'notes')) OR
        EXISTS (SELECT 1 FROM json_each(json_extract(audit_snapshot_json, '$.after')) WHERE key NOT IN ('title', 'performedAt', 'notes')) OR
        EXISTS (SELECT 1 FROM json_each(json_extract(audit_snapshot_json, '$.before')) GROUP BY key HAVING COUNT(*) > 1) OR
        EXISTS (SELECT 1 FROM json_each(json_extract(audit_snapshot_json, '$.after')) GROUP BY key HAVING COUNT(*) > 1) OR
        COALESCE(json_type(audit_snapshot_json, '$.deleted'), 'missing') <> 'missing' OR
        EXISTS (SELECT 1 FROM json_each(audit_snapshot_json) WHERE key NOT IN ('recordId', 'taskId', 'createdAt', 'before', 'after')))) OR
      (type = 'maintenance_record_deleted' AND (
        COALESCE(json_type(audit_snapshot_json, '$.deleted'), 'missing') <> 'object' OR
        COALESCE(json_type(audit_snapshot_json, '$.deleted.title'), 'missing') <> 'text' OR
        trim(json_extract(audit_snapshot_json, '$.deleted.title')) = '' OR
        json_extract(audit_snapshot_json, '$.deleted.title') <> trim(json_extract(audit_snapshot_json, '$.deleted.title')) OR
        length(json_extract(audit_snapshot_json, '$.deleted.title')) > 100 OR
        COALESCE(json_type(audit_snapshot_json, '$.deleted.performedAt'), 'missing') <> 'text' OR
        length(json_extract(audit_snapshot_json, '$.deleted.performedAt')) <> 10 OR
        json_extract(audit_snapshot_json, '$.deleted.performedAt') NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
        COALESCE(date(json_extract(audit_snapshot_json, '$.deleted.performedAt')), 'invalid') <> json_extract(audit_snapshot_json, '$.deleted.performedAt') OR
        COALESCE(json_type(audit_snapshot_json, '$.deleted.notes'), 'missing') NOT IN ('text', 'null') OR
        (json_type(audit_snapshot_json, '$.deleted.notes') = 'text' AND (trim(json_extract(audit_snapshot_json, '$.deleted.notes')) = '' OR json_extract(audit_snapshot_json, '$.deleted.notes') <> trim(json_extract(audit_snapshot_json, '$.deleted.notes')) OR length(json_extract(audit_snapshot_json, '$.deleted.notes')) > 1000)) OR
        EXISTS (SELECT 1 FROM json_each(json_extract(audit_snapshot_json, '$.deleted')) WHERE key NOT IN ('title', 'performedAt', 'notes')) OR
        EXISTS (SELECT 1 FROM json_each(json_extract(audit_snapshot_json, '$.deleted')) GROUP BY key HAVING COUNT(*) > 1) OR
        COALESCE(json_type(audit_snapshot_json, '$.before'), 'missing') <> 'missing' OR
        COALESCE(json_type(audit_snapshot_json, '$.after'), 'missing') <> 'missing' OR
        EXISTS (SELECT 1 FROM json_each(audit_snapshot_json) WHERE key NOT IN ('recordId', 'taskId', 'createdAt', 'deleted'))))
    )) AS invalid_activity_audits,
    (SELECT COUNT(*) FROM activity_entries WHERE type NOT IN ('maintenance_record_updated', 'maintenance_record_deleted') AND audit_snapshot_json IS NOT NULL) AS unexpected_activity_audits;
  ```

  The command must return one row with all seven integer columns equal to `0`; a missing table/column,
  a second row, or any nonzero value is a failed gate. The notification bootstrap validation is a
  second command with the same single-row/zero-value contract. `NOTIFICATION_BOOTSTRAP_VALIDATION_SQL`
  is exactly:

  ```sql
  SELECT
    (SELECT COUNT(*) FROM notification_migration_anomalies WHERE resolved_at IS NULL) AS unresolved_anomalies,
    (SELECT COUNT(*) FROM maintenance_tasks t JOIN assets a ON a.id = t.asset_id LEFT JOIN notification_task_heads h ON h.maintenance_task_id = t.id WHERE a.archived_at IS NULL AND (h.id IS NULL OR h.status IS NOT 'active' OR h.current_next_due IS NOT t.next_due)) AS invalid_active_heads,
    (SELECT COUNT(*) FROM notification_sweep_runs WHERE status = 'running') AS incomplete_sweep_runs;
  ```

  The second command must return exactly one row with columns `unresolved_anomalies`,
  `invalid_active_heads`, and `incomplete_sweep_runs`, all equal to integer `0`.

  A sweep creates its run row, items, fired transitions, notifications, batches, and outbox rows
  in one D1 transaction and marks the run `completed` in that same transaction. A D1/transaction
  failure rolls back the run row and all work; the next invocation retries the same deterministic
  `sweepRunId`. There is no normal `failed` sweep status or manual status-transition repair path. A
  committed `running` row is an incomplete migration anomaly and blocks deployment; the only
  recovery is an idempotent retry using the same `sweepRunId`, which must complete the run or leave
  it blocked.

- Old maintenance writers are not allowed to write during the backfill window. The exact rollout is: (1) deploy and health-check a compatibility Worker that checks `maintenance_write_gate` on every task/record create, edit, delete, and link operation; (2) apply `0017` while the gate is still `open` because it is schema expansion only; (3) execute `UPDATE maintenance_write_gate SET mode = 'frozen' WHERE id = 1` and require one affected row; (4) apply `0018` through `0021`; (5) run both single-row validation commands; (6) deploy and health-check the final Worker while the gate remains `frozen`; (7) execute `UPDATE maintenance_write_gate SET mode = 'open' WHERE id = 1` and require one affected row. Reads remain available. A frozen or unavailable gate fails closed for writes with HTTP 503, error code `maintenance_write_frozen`, and a retryable response; the UI shows retryable state. If any migration, validation, deployment, health check, or gate update fails, the gate stays frozen; rollback is permitted only to a compatibility build that understands the gate, never to an un-gated old writer.
- The existing `.github/workflows/deploy.yml` migration-before-deploy ordering is not an accepted rollout for this slice; the implementation PR must replace it with the seven-step sequence above before enabling the new writers.
- Wrangler applies every pending migration in its directory, so the seven steps use two release
  boundaries: Release A contains only `0017` plus the gate-aware compatibility Worker and runs
  `wrangler d1 migrations apply pineapple --remote`; after the gate is frozen, Release B adds
  `0018` through `0021`, runs the same migrations command to apply exactly those four files, runs
  both validation commands, and deploys the final Worker. No release may contain `0018`–`0021`
  while Release A is applying `0017`; if another migration is pending, the release fails closed
  before applying anything.
- Before either migrations command, the workflow runs `pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations list pineapple --remote` and parses the unapplied filenames. Release A proceeds only when the unapplied set is exactly `{0017_maintenance_seed_revision_expand.sql}`; Release B proceeds only when it is exactly `{0018_maintenance_seed_revision_backfill.sql, 0019_activity_history_correction_types.sql, 0020_notification_heads_email_claims.sql, 0021_notification_scheduler_bootstrap.sql}`. An empty set, an extra migration, a missing expected migration, malformed command output, or a list-command failure exits nonzero before `migrations apply` is invoked.

## Out of Scope

- Mileage/odometer-based intervals (Phase 2)
- Distance-based intervals must not be implemented by adding `"mile"` or `"hour"` to the time
  interval enum. Future distance/hour tasks need an explicit discriminator such as
  `type: "time" | "distance"` and separate fields like `lastCompletedOdometer` /
  `nextDueMileage`.
- Directly setting `lastCompletedDate` or `nextDue` via the edit endpoint — the dedicated reschedule endpoint owns one-cycle due-date overrides, and this boundary keeps task metadata edits from colliding with scheduling semantics
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
