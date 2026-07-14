---
name: dashboard
description: Authenticated home screen read model for fleet health and the cross-asset maintenance queue
metadata:
  type: feature
---

# Dashboard

**Status:** in-progress
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-07-13
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [asset-library.md](./asset-library.md), [maintenance-task.md](./maintenance-task.md), [maintenance-record.md](./maintenance-record.md), [teams-foundation.md](./teams-foundation.md)

---

## Summary

The Dashboard is the authenticated home screen at `/app`. It gives the operator an at-a-glance view of fleet size, asset categories, fleet maintenance health, and the most urgent scheduled maintenance across all active assets. "Its assets" means every active asset the caller can access — those they **own** and those a teammate has **shared with their team** ([teams-foundation.md](./teams-foundation.md)) — so totals, health, and the queue reflect everything the operator helps maintain, with shared assets marked. The first API-backed version is read-oriented: it can launch existing maintenance flows and can mark a time-based task complete through the existing maintenance-record creation endpoint, but rescheduling, snoozing, reminders, and richer service-task metadata are future work.

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
- As a **team member**, I can **see maintenance for assets shared with my team on the dashboard, marked as shared** so that **I know what needs attention across everything I help maintain and whose it is**

## API Requirements

_Each criterion carries exactly one slice tag (`S1`…`S4`) from the [Delivery Plan](#delivery-plan)._

### Dashboard read model

- [ ] `S1` Add `GET /api/dashboard` as a protected application API endpoint
- [ ] `S1` The endpoint returns the caller's dashboard state in a single response; the web app must not need to call `GET /api/assets` and then fan out to per-asset task endpoints for initial dashboard render
- [ ] `S1` The endpoint uses the resolved authenticated `User.id` as the identity input; no `ownerId` is accepted from the request
- [ ] `S2` Every active, non-archived asset the caller can **access** — owned **and** currently shared with the caller's team ([teams-foundation.md](./teams-foundation.md)) — is included in fleet totals, category counts, health counts, and queue items; assets neither owned by nor shared with the caller are never included
- [x] `S3` Each asset represented on the dashboard (in fleet data and in every queue item) carries the computed **`sharing`** descriptor (`scope`, `isOwner`, and `ownerDisplayName` when shared with the caller) per ADR-0009, so the client can mark shared items and attribute the owner without a second lookup
- [ ] `S4` A queue item for an asset shared with the caller by a teammate is rendered with a shared indicator and the owner's display name; an item for an asset the caller owns and has shared shows a "shared with team" indicator; personal assets show none
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
- [ ] `S1` `Reschedule`, `Snooze`, dashboard-level `Add service`, and richer task-detail editing remain placeholders until the maintenance-task API is extended

## Delivery Plan

| Slice | Scope                                                                                                                                                 | Issue                                                    | Depends on |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| `S1`  | Base dashboard — `GET /api/dashboard` read model, status calculation, queue, actions, `/app` page. Shipped on `main` (see Flags: box reconciliation). | —                                                        | —          |
| `S2`  | Visible-set scoping — totals/health/queue span owned + team-shared assets, delivered by teams-foundation `S2`. Shipped on `main` (see Flags).         | [#58](https://github.com/snaveevans/pineapple/issues/58) | `S1`       |
| `S3`  | `sharing` descriptor on the dashboard read model — the dashboard's share of teams-foundation `S4`.                                                    | [#74](https://github.com/snaveevans/pineapple/issues/74) | `S2`       |
| `S4`  | Web shared indicators on queue rows — the dashboard's share of teams-foundation `S5`.                                                                 | [#59](https://github.com/snaveevans/pineapple/issues/59) | `S3`       |

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

## Telemetry

**Request telemetry:** `GET /api/dashboard` maps to the `GetDashboard` operation via `createTechnicalTelemetryMiddleware`. Implementing the endpoint requires adding this route to the operation-name mapping and updating [telemetry.md](../cross-cutting/telemetry.md).

**Domain events:** None for the dashboard read model. Reads do not publish domain events. Completing a task from the dashboard uses the existing `CreateMaintenanceRecord` operation and may publish the existing `MaintenanceRecordCreated` and `MaintenanceTaskAdvanced` domain events.

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

**FOLLOW-UP NEEDED — Reschedule and snooze:** The prototype includes these actions, but no task mutation semantics exist. A future spec should define whether these are task updates, one-off overrides, or separate scheduled exceptions.

**FOLLOW-UP NEEDED — Dashboard-level task creation:** The prototype's "Add service" button needs a concrete entry path, target asset selection behavior, and field set before it becomes an API-backed workflow.

## Out of Scope

- Adding a fourth `lawn` / `grounds` asset type
- Mileage/hour meter tracking and distance-based maintenance schedules
- Reminder delivery through notifications, email, or background jobs
- Reschedule, snooze, or bulk task management
- Editing task detail fields from the dashboard
- Assigning or delegating tasks to specific teammates, and any per-member views — shared-asset **visibility** is in scope (shared assets appear and are marked), but task assignment/delegation is not
- Frontend interaction telemetry
