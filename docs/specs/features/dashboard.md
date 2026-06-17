---
name: dashboard
description: Authenticated home screen read model for fleet health and the cross-asset maintenance queue
metadata:
  type: feature
---

# Dashboard

**Status:** draft
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-17
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [asset-library.md](./asset-library.md), [maintenance-task.md](./maintenance-task.md), [maintenance-record.md](./maintenance-record.md)

---

## Summary

The Dashboard is the authenticated home screen at `/app`. It gives the operator an at-a-glance view of fleet size, asset categories, fleet maintenance health, and the most urgent scheduled maintenance across all active assets. The first API-backed version is read-oriented: it can launch existing maintenance flows and can mark a time-based task complete through the existing maintenance-record creation endpoint, but rescheduling, snoozing, reminders, and richer service-task metadata are future work.

## Implementation Notes

`apps/web/src/app/AppHome.tsx` currently renders hardcoded prototype data. The desired API behavior below intentionally replaces that mock rather than preserving it. The existing mock is useful only as evidence of required capabilities:

- The dashboard needs one protected read model instead of browser-side fan-out across `GET /api/assets` and per-asset task endpoints.
- The supported asset categories remain `vehicle`, `equipment`, and `property`; the mock's `lawn` / `Grounds` category is not part of this spec.
- The current maintenance-task model supports time-based schedules only. Meter readings, mileage/hour recurrence, estimated time, location, assignee, and task notes are future task-model work.
- `Mark complete` can use the existing linked maintenance-record flow. `Reschedule`, `Snooze`, and dashboard-level task creation need future specs before they become live actions.

## User Stories

- As an **authenticated owner-operator**, I can **open the dashboard and see fleet maintenance health from live data** so that **I know whether anything needs attention now**
- As an **authenticated owner-operator**, I can **see active asset totals and category counts** so that **I understand what the dashboard is summarizing**
- As an **authenticated owner-operator**, I can **see overdue and upcoming maintenance tasks across all active assets in urgency order** so that **I can act on the right task first**
- As an **authenticated owner-operator with no assets or no scheduled tasks**, I can **see an explicit empty state** so that **I know whether to add an asset or add maintenance tasks**
- As an **authenticated owner-operator**, I can **start completion for a due task from the dashboard** so that **completed work advances the existing maintenance schedule**

## API Requirements

### Dashboard read model

- [ ] Add `GET /api/dashboard` as a protected application API endpoint
- [ ] The endpoint returns the caller's dashboard state in a single response; the web app must not need to call `GET /api/assets` and then fan out to per-asset task endpoints for initial dashboard render
- [ ] The endpoint uses the resolved authenticated `User.id` as the ownership input; no `ownerId` is accepted from the request
- [ ] Only active, non-archived assets owned by the caller are included in fleet totals, category counts, health counts, and queue items
- [ ] Tasks belonging to archived assets are excluded from the dashboard queue, even though asset-scoped task history may remain readable elsewhere
- [ ] The response includes a viewer display name suitable for the greeting, derived from the authenticated session profile when available
- [ ] The response includes `todayUtc` or an equivalent server-side date basis used to calculate task urgency; date-only calculations must follow the maintenance date rules in [maintenance-task.md](./maintenance-task.md)
- [ ] Fleet totals include the total active asset count and counts for the supported asset types: vehicle, equipment, and property
- [ ] Fleet health counts are computed per asset by that asset's most urgent scheduled task: overdue wins over due soon, due soon wins over on track
- [ ] Assets with no scheduled maintenance tasks are counted separately from on-track assets so the dashboard can avoid presenting "no schedule" as healthy service status
- [ ] The maintenance queue contains scheduled maintenance tasks across all active assets, not one synthesized row per asset
- [ ] Each queue item includes enough task and asset summary data to render the queue row and selected-detail panel without an additional asset lookup
- [ ] Queue items are sorted by urgency first, then by `nextDue` ascending, then by task creation time for stable ordering
- [ ] The dashboard does not include `Grounds` / `lawn` category data unless a future asset-type spec and API contract add that type
- [ ] The dashboard does not include meter readings, mileage/hour intervals, estimated time, location, assignee, or free-form task notes until those fields are added to the maintenance-task contract

### Status calculation

- [ ] A task is `overdue` when `nextDue` is before `todayUtc`
- [ ] A task is `soon` when `nextDue` is today or within the next 7 calendar days
- [ ] A task is `ok` when `nextDue` is more than 7 calendar days after `todayUtc`
- [ ] The relative due-day value is calculated with date-only calendar arithmetic, not timestamp subtraction through user-local time zones
- [ ] Due labels such as "Overdue · 3 days", "Today", "Tomorrow", or "In 5 days" may be formatted by the frontend from the API's date/status data; the API should not be required to return presentation copy

### Dashboard actions

- [ ] Selecting a queue item is frontend state; the API does not persist or return a selected item
- [ ] The default selected item is the first queue item after urgency sorting
- [ ] Category filtering is frontend state for the first API-backed version; the dashboard response must contain category and count data needed to filter the returned queue without a new request
- [ ] `Mark complete` for a time-based task uses `POST /api/assets/{assetId}/maintenance-records` with the selected `taskId`, as defined in [maintenance-record.md](./maintenance-record.md) and [maintenance-task.md](./maintenance-task.md)
- [ ] After successful completion, the frontend invalidates the dashboard read model and the affected asset's maintenance records/tasks
- [ ] `Reschedule`, `Snooze`, dashboard-level `Add service`, and richer task-detail editing remain placeholders until the maintenance-task API is extended

## Validation & Ownership

**Authentication:** The dashboard is available only to authenticated users. A missing or invalid session returns 401 through the shared authentication middleware.

**Permissions:** Dashboard data is scoped entirely by the resolved `User.id`. Collection queries must filter by owner and active asset state. The response must never expose another user's assets, tasks, maintenance records, `ownerId`, or auth-provider identifiers.

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
| Asset type is not one of the supported API types              | Not possible under the current asset schema; dashboard must not synthesize `lawn`/`grounds`                                                    |
| Dashboard request fails with non-401 error                    | Frontend shows a dashboard-level error state with retry                                                                                        |
| Queue becomes empty after filtering                           | Frontend shows a filtered-empty state; this is not an API error                                                                                |
| Linked task completion succeeds                               | New maintenance record appears in asset history; task advances per [maintenance-task.md](./maintenance-task.md); dashboard is refetched        |
| Linked task completion returns 409 because asset was archived | Completion error is shown and dashboard is refetched so archived data disappears                                                               |

## Telemetry

**Request telemetry:** `GET /api/dashboard` maps to the `GetDashboard` operation via `createTechnicalTelemetryMiddleware`. Implementing the endpoint requires adding this route to the operation-name mapping and updating [telemetry.md](../cross-cutting/telemetry.md).

**Domain events:** None for the dashboard read model. Reads do not publish domain events. Completing a task from the dashboard uses the existing `CreateMaintenanceRecord` operation and may publish the existing `MaintenanceRecordCreated` and `MaintenanceTaskAdvanced` domain events.

## Flags

**FOLLOW-UP NEEDED — Maintenance task detail fields:** The prototype shows estimated time, location/where, assignee/vendor, and notes. These fields do not exist in the maintenance-task API or D1 schema. Add them through [maintenance-task.md](./maintenance-task.md) before rendering them from live data.

**FOLLOW-UP NEEDED — Distance/hour-based schedules:** The prototype includes mile/hour readings and recurrence. This remains phase 2 and must follow the discriminator guidance in [maintenance-task.md](./maintenance-task.md), not an ad hoc `"mile"` or `"hour"` addition to the time interval enum.

**FOLLOW-UP NEEDED — Reschedule and snooze:** The prototype includes these actions, but no task mutation semantics exist. A future spec should define whether these are task updates, one-off overrides, or separate scheduled exceptions.

**FOLLOW-UP NEEDED — Dashboard-level task creation:** The prototype's "Add service" button needs a concrete entry path, target asset selection behavior, and field set before it becomes an API-backed workflow.

## Out of Scope

- Adding a fourth `lawn` / `grounds` asset type
- Mileage/hour meter tracking and distance-based maintenance schedules
- Reminder delivery through notifications, email, or background jobs
- Reschedule, snooze, or bulk task management
- Editing task detail fields from the dashboard
- Team assignment, delegation, or multi-user visibility
- Frontend interaction telemetry
