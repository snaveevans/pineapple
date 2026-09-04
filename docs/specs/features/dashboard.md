---
name: dashboard
description: Authenticated home screen read model for fleet health and the cross-asset maintenance queue
metadata:
  type: feature
---

# Dashboard

**Status:** in-progress
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-09-03
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [asset-library.md](./asset-library.md), [maintenance-task.md](./maintenance-task.md), [maintenance-record.md](./maintenance-record.md), [notifications.md](./notifications.md), [teams-foundation.md](./teams-foundation.md)

---

## Summary

The Dashboard is the authenticated home screen at `/app`. It gives the operator an at-a-glance view of fleet size, asset categories, fleet maintenance health, and the most urgent scheduled maintenance across all active assets. "Its assets" means every active asset the caller can access — those they **own** and those a teammate has **shared with their team** ([teams-foundation.md](./teams-foundation.md)) — so totals, health, and the queue reflect everything the operator helps maintain, with shared assets marked. It can launch existing maintenance flows and mark a time-based task complete through the maintenance-record endpoint. The shipped `S5` slice added a dedicated action to reschedule the current task cycle; the `S6` slice adds a snooze action that postpones the task's **reminder** for one day at a time without changing the task's schedule — the reminder and its snooze state are owned by [notifications.md](./notifications.md), and the queue row keeps its computed urgency. Richer service-task metadata remains a separate concern.

## Implementation Notes

`apps/web/src/app/AppHome.tsx` currently renders hardcoded prototype data. The desired API behavior below intentionally replaces that mock rather than preserving it. The existing mock is useful only as evidence of required capabilities:

- The dashboard needs one protected read model instead of browser-side fan-out across `GET /api/assets` and per-asset task endpoints.
- The supported asset categories remain `vehicle`, `equipment`, and `property`; the mock's `lawn` / `Grounds` category is not part of this spec.
- The current maintenance-task model supports time-based schedules only. Meter readings, mileage/hour recurrence, estimated time, location, assignee, and task notes are future task-model work.
- `Mark complete` uses the existing linked maintenance-record flow. `S5` made `Reschedule` use the maintenance-task feature's dedicated one-cycle override. `S6` makes `Snooze` call the notifications-owned snooze endpoint: it postpones only the task's reminder, one day at a time, never the task schedule. Dashboard-level task creation remains a separate concern.

## User Stories

- As an **authenticated owner-operator**, I can **open the dashboard and see fleet maintenance health from live data** so that **I know whether anything needs attention now**
- As an **authenticated owner-operator**, I can **see active asset totals and category counts** so that **I understand what the dashboard is summarizing**
- As an **authenticated owner-operator**, I can **see overdue and upcoming maintenance tasks across all active assets in urgency order** so that **I can act on the right task first**
- As an **authenticated owner-operator with no assets or no scheduled tasks**, I can **see an explicit empty state** so that **I know whether to add an asset or add maintenance tasks**
- As an **authenticated owner-operator**, I can **start completion for a due task from the dashboard** so that **completed work advances the existing maintenance schedule**
- As an **authenticated user**, I can **reschedule a task from the dashboard without logging maintenance** so that **a changed plan updates the current due date without falsely recording work**
- As an **authenticated owner-operator who can't act on a due task yet**, I can **snooze its reminder for one day from the dashboard** so that **the nudging stops until tomorrow without pretending the work is done or changing when the task is due**
- As a **team member**, I can **see maintenance for assets shared with my team on the dashboard, marked as shared** so that **I know what needs attention across everything I help maintain and whose it is**

## API Requirements

_Each criterion carries exactly one slice tag (`S1`…`S6`) from the [Delivery Plan](#delivery-plan)._

### Dashboard read model

- [ ] `S1` Add `GET /api/dashboard` as a protected application API endpoint
- [ ] `S1` The endpoint returns the caller's dashboard state in a single response; the web app must not need to call `GET /api/assets` and then fan out to per-asset task endpoints for initial dashboard render
- [ ] `S1` The endpoint uses the resolved authenticated `User.id` as the identity input; no `ownerId` is accepted from the request
- [ ] `S2` Every active, non-archived asset the caller can **access** — owned **and** currently shared with the caller's team ([teams-foundation.md](./teams-foundation.md)) — is included in fleet totals, category counts, health counts, and queue items; assets neither owned by nor shared with the caller are never included
- [x] `S3` Every queue item carries the computed **`sharing`** descriptor (`scope`, `isOwner`, and `ownerDisplayName` when shared with the caller) per ADR-0009, so the client can mark shared items and attribute the owner without a second lookup. Fleet totals and health are aggregate counts, not per-asset lists, so they carry no descriptor
- [x] `S4` A queue item for an asset shared with the caller by a teammate is rendered with a shared indicator and the owner's display name; an item for an asset the caller owns and has shared shows a "shared with team" indicator; personal assets show none
- [ ] `S1` Tasks belonging to archived assets are excluded from the dashboard queue, even though asset-scoped task history may remain readable elsewhere
- [ ] `S1` The response includes a viewer display name suitable for the greeting, derived from the authenticated session profile when available
- [ ] `S1` The response includes `todayUtc`, the server-side calendar date used to calculate task urgency; date-only calculations must follow the maintenance date rules in [maintenance-task.md](./maintenance-task.md)
- [ ] `S1` Fleet totals include the total active asset count and counts for the supported asset types: vehicle, equipment, and property
- [ ] `S1` Fleet health counts are computed per asset by that asset's most urgent scheduled task: overdue wins over due soon, due soon wins over on track
- [ ] `S1` Assets with no scheduled maintenance tasks are counted separately from on-track assets so the dashboard can avoid presenting "no schedule" as healthy service status
- [ ] `S1` The maintenance queue contains scheduled maintenance tasks across all active assets, not one synthesized row per asset
- [ ] `S1` Each queue item includes enough task and asset summary data to render the queue row and selected-detail panel without an additional asset lookup
- [ ] `S1` Queue items are sorted by urgency first, then by `nextDue` ascending, then by task creation time for stable ordering
- [ ] `S1` The dashboard does not include `Grounds` / `lawn` category data unless a future asset-type spec and API contract add that type
- [ ] `S1` The dashboard does not include meter readings, mileage/hour intervals, estimated time, location, assignee, or free-form task notes until those fields are added to the maintenance-task contract

### Status calculation

- [ ] `S1` A task is `overdue` when `nextDue` is before `todayUtc`
- [ ] `S1` A task is `soon` when `nextDue` is today or within the next 7 calendar days
- [ ] `S1` A task is `ok` when `nextDue` is more than 7 calendar days after `todayUtc`
- [ ] `S1` The relative due-day value is calculated with date-only calendar arithmetic, not timestamp subtraction through user-local time zones
- [ ] `S1` Due labels such as "Overdue · 3 days", "Today", "Tomorrow", or "In 5 days" may be formatted by the frontend from the API's date/status data; the API should not be required to return presentation copy

### Dashboard actions

- [ ] `S1` Selecting a queue item is frontend state; the API does not persist or return a selected item
- [ ] `S1` The default selected item is the first queue item after urgency sorting
- [ ] `S1` Category filtering is frontend state for the first API-backed version; the dashboard response must contain category and count data needed to filter the returned queue without a new request
- [ ] `S1` `Mark complete` for a time-based task uses `POST /api/assets/{assetId}/maintenance-records` with the selected `taskId`, as defined in [maintenance-record.md](./maintenance-record.md) and [maintenance-task.md](./maintenance-task.md)
- [ ] `S1` After successful completion, the frontend invalidates the dashboard read model and the affected asset's maintenance records/tasks
- [x] `S5` `Reschedule` opens a future-date form for the selected task and submits `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/reschedule` as defined in [maintenance-task.md](./maintenance-task.md); it never creates a maintenance record
- [x] `S5` While a reschedule is pending, only its submitting action is disabled; on 422 the future-date field shows the server error, and on 403/404/503 the current dashboard data remains visible with the shared error/retry treatment
- [x] `S5` A successful reschedule updates the selected queue item and invalidates the dashboard read model plus the affected asset's maintenance-task list; status and due copy always come from the returned/refetched API data
- [x] `S6` Each queue item carries a nullable `snoozedUntil` reminder descriptor for the task's current reminder cycle, computed in the application layer from notifications-owned reminder state (the ADR-0009 pattern used by `sharing`); it is task-scoped, so every viewer of the row sees the same value
- [x] `S6` `Snooze` submits `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/snooze` with `{ durationDays: 1 }` as defined in [notifications.md](./notifications.md); it never creates a maintenance record and never changes the task schedule, its computed urgency, or the queue's ordering
- [x] `S6` While snoozed, the queue row keeps its computed urgency color and position and shows a "Reminder snoozed until {date}" chip; the Snooze action is disabled until the snooze expires
- [x] `S6` While a snooze is pending, only its submitting action is disabled; on 422/403/404 (and the rare 409 after snooze-retry exhaustion) the current dashboard data remains visible with the shared error treatment and the read model is re-fetched so the row reconciles; on success the dashboard read model is invalidated so the descriptor reflects the API
- [x] `S6` When the snooze expires — or any task event supersedes the reminder's cycle — the chip disappears and the action re-enables on the next fetch
- [ ] `S1` Dashboard-level `Add service` and richer task-detail editing remain placeholders until their own specs extend the task APIs

## Delivery Plan

| Slice | Scope                                                                                                                                                 | Issue                                                      | Depends on                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `S1`  | Base dashboard — `GET /api/dashboard` read model, status calculation, queue, actions, `/app` page. Shipped on `main` (see Flags: box reconciliation). | —                                                          | —                                          |
| `S2`  | Visible-set scoping — totals/health/queue span owned + team-shared assets, delivered by teams-foundation `S2`. Shipped on `main` (see Flags).         | [#58](https://github.com/snaveevans/pineapple/issues/58)   | `S1`                                       |
| `S3`  | `sharing` descriptor on the dashboard read model — the dashboard's share of teams-foundation `S4`.                                                    | [#74](https://github.com/snaveevans/pineapple/issues/74)   | `S2`                                       |
| `S4`  | Web shared indicators on queue rows — the dashboard's share of teams-foundation `S5`.                                                                 | [#59](https://github.com/snaveevans/pineapple/issues/59)   | `S3`                                       |
| `S5`  | Reschedule action: future-date form, error/pending states, and dashboard/task-list cache updates.                                                     | [#235](https://github.com/snaveevans/pineapple/issues/235) | maintenance-task `S5`                      |
| `S6`  | Snooze action: notifications-owned one-day reminder snooze, `snoozedUntil` queue descriptor, snoozed chip + disabled button, error/pending states.    | [#236](https://github.com/snaveevans/pineapple/issues/236) | notifications snooze endpoint (same issue) |

## Validation & Ownership

**Authentication:** The dashboard is available only to authenticated users. A missing or invalid session returns 401 through the shared authentication middleware.

**Permissions:** Dashboard data is scoped by what the resolved `User.id` can **access**. Collection queries filter to active assets the caller owns **or** that are currently shared with the caller's team ([teams-foundation.md](./teams-foundation.md), [permissions.md](../cross-cutting/permissions.md)), not by ownership alone. Shared-asset visibility is evaluated against current sharing state. The response may expose a shared asset's owner display name (via the `sharing` descriptor) but must never expose an asset the caller cannot access, nor raw `ownerId` or auth-provider identifiers.

**Validation:** `GET /api/dashboard` has no request body. If query parameters are added later for server-side filtering or pagination, they must be validated at the Zod HTTP edge and reflected in the generated OpenAPI document.

**Date-only behavior:** Dashboard status calculations use the same date-only conventions as maintenance tasks. `nextDue` is a `YYYY-MM-DD` value; urgency is derived from calendar dates rather than timestamps.

## Edge Cases & Error States

| Scenario                                                      | Expected Behavior                                                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| No valid session                                              | API returns 401; frontend redirects to `/login` through the shared API-client behavior                                                         |
| User has zero active assets                                   | Dashboard renders an empty fleet state with a primary path to add an asset; all counts are 0 and queue is empty                                |
| User has active assets but no scheduled tasks                 | Fleet totals/category counts render; queue empty state prompts the user to add scheduled maintenance; unscheduled asset count reflects the gap |
| All scheduled tasks are on track                              | Overdue and due-soon counts are 0; queue still shows upcoming tasks ordered by `nextDue`                                                       |
| Multiple tasks on one asset                                   | The queue may show multiple rows for that asset; fleet health counts the asset once using its most urgent task                                 |
| Task due today                                                | Status is `soon`; frontend may render "Today"                                                                                                  |
| Task from archived asset                                      | Excluded from dashboard queue and health counts                                                                                                |
| Asset shared with the caller by a teammate                    | Its active tasks appear in the queue and its health counts toward fleet totals; the queue row shows a shared indicator with the owner's name   |
| Asset the caller owns and has shared to their team            | Appears as normal, marked "shared with team"                                                                                                   |
| A shared asset is unshared after the dashboard loaded         | On the next fetch it drops out of a non-owner member's totals, health, and queue                                                               |
| Asset type is not one of the supported API types              | Not possible under the current asset schema; dashboard must not synthesize `lawn`/`grounds`                                                    |
| Dashboard request fails with non-401 error                    | Frontend shows a dashboard-level error state with retry                                                                                        |
| Queue becomes empty after filtering                           | Frontend shows a filtered-empty state; this is not an API error                                                                                |
| Linked task completion succeeds                               | New maintenance record appears in asset history; task advances per [maintenance-task.md](./maintenance-task.md); dashboard is refetched        |
| Linked task completion returns 409 because asset was archived | Completion error is shown and dashboard is refetched so archived data disappears                                                               |
| Reschedule target is today, past, or malformed                | API returns 422; the form remains open with an inline `nextDue` error and no queue item changes                                                |
| Reschedule succeeds                                           | No maintenance record is created; the selected item renders the returned/refetched effective `nextDue` and its recomputed urgency              |
| Reschedule is forbidden, missing, or writes are frozen        | Current dashboard data remains visible; the action shows the shared 403/404/503 error and a retry when applicable                              |
| Snooze succeeds                                               | The row keeps its urgency and position; the snoozed chip appears and the action disables until expiry; the dashboard read model is refetched   |
| Snooze returns 422/403/404/409                                | Current dashboard data remains visible; the action shows the shared error treatment and the read model is re-fetched so the row reconciles     |
| Task has no reminder state (`snoozedUntil` null)              | Row renders with no chip and Snooze enabled; submitting returns 404 and shows the shared error treatment with no row change                    |
| Snoozed task advances (completion, reschedule, interval edit) | The snooze drops with the superseded reminder cycle; the row renders unsnoozed on the next fetch                                               |
| Snoozed reminder expires                                      | The chip disappears and the action re-enables on the next fetch; the reminder fires again per [notifications.md](./notifications.md)           |
| Snooze on a task due far in the future                        | Permitted but inert — the reminder was not going to fire before its natural fire date anyway (`max(fireAt, snoozedUntil)` rule)                |

## Telemetry

**Request telemetry:** `GET /api/dashboard` maps to the `GetDashboard` operation via `createTechnicalTelemetryMiddleware`. Implementing the endpoint requires adding this route to the operation-name mapping and updating [telemetry.md](../cross-cutting/telemetry.md).

**Domain events:** None for the dashboard read model. Reads do not publish domain events. Completing a task from the dashboard uses the existing `CreateMaintenanceRecord` operation and may publish the existing `MaintenanceRecordCreated` and `MaintenanceTaskAdvanced` domain events. `S5` rescheduling uses `RescheduleMaintenanceTask` and publishes `MaintenanceTaskRescheduled` as defined in [maintenance-task.md](./maintenance-task.md). `S6` snoozing uses the `SnoozeMaintenanceReminder` operation and publishes `MaintenanceReminderSnoozed` as defined in [notifications.md](./notifications.md) — the dashboard publishes no domain events of its own.

## Flags

**REVIEW NEEDED — `S1`/`S2` boxes not yet reconciled with shipped code:** The base dashboard
(`S1`) and visible-set scoping (`S2`, landed via teams-foundation `S2` /
[#58](https://github.com/snaveevans/pineapple/issues/58)) are implemented on `main` —
`GET /api/dashboard` backed by `GetDashboard` (with `GetDashboard.test.ts`), and `AppHome.tsx`
renders it from live data, which also makes the Implementation Notes above (describing a
hardcoded prototype) stale. A brownfield pass (`/spec-author`) should tick each `S1`/`S2` box a
test on `main` actually covers, unpick any that aren't yet true, and refresh the Implementation
Notes. The spec is marked `in-progress` — `S1`/`S2` shipped, `S3`
([#74](https://github.com/snaveevans/pineapple/issues/74)) and `S4`
([#59](https://github.com/snaveevans/pineapple/issues/59)) pending — on that basis, rather than
left at `review`. Owner: engineering.

**FOLLOW-UP NEEDED — Maintenance task detail fields:** The prototype shows estimated time, location/where, assignee/vendor, and notes. These fields do not exist in the maintenance-task API or D1 schema. Add them through [maintenance-task.md](./maintenance-task.md) before rendering them from live data.

**FOLLOW-UP NEEDED — Distance/hour-based schedules:** The prototype includes mile/hour readings and recurrence. This remains phase 2 and must follow the discriminator guidance in [maintenance-task.md](./maintenance-task.md), not an ad hoc `"mile"` or `"hour"` addition to the time interval enum.

**FOLLOW-UP NEEDED — Dashboard-level task creation:** The prototype's "Add service" button needs a concrete entry path, target asset selection behavior, and field set before it becomes an API-backed workflow.

## Out of Scope

- Adding a fourth `lawn` / `grounds` asset type
- Mileage/hour meter tracking and distance-based maintenance schedules
- Reminder delivery (inbox/email), reminder scheduling, and snooze _state_ are owned by [notifications.md](./notifications.md); the dashboard renders the snooze descriptor and hosts the action
- Bulk task management
- Editing task detail fields from the dashboard
- Assigning or delegating tasks to specific teammates, and any per-member views — shared-asset **visibility** is in scope (shared assets appear and are marked), but task assignment/delegation is not
- Frontend interaction telemetry
