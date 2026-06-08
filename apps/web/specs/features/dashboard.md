---
name: dashboard
description: Work-in-progress authenticated home screen for fleet overview and future service queue workflows
metadata:
  type: feature
  package: web
---

# Dashboard (Web)

**Status:** wip
**Owner:** [unknown — assign on review]
**Package:** `apps/web`
**Last Updated:** 2026-06-08
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [loading-states.md](../cross-cutting/loading-states.md) · [session-contract.md](../../../../docs/specs/universal/session-contract.md)

---

## Summary

The Dashboard is the work-in-progress authenticated home screen at `/app`. It is
intended to become the operator's "what needs attention now" view, with fleet-wide
status counters and a service queue. The current screen is a prototype backed by
placeholder data, so this spec records the intended direction without treating the
feature as finished. It is a web-only feature today; no API capability backs it yet.

This feature is not a current priority. Do not use this spec as a completion
checklist until the unresolved WIP gaps are reviewed and promoted into active
requirements.

## User Stories

- As an **authenticated user**, I can **see how many assets are overdue, due soon, and
  on track** so that **I know the health of my fleet at a glance**
- As a **user**, I can **see the highest-urgency service item by default** so that **I
  know what to act on first without searching**
- As a **user**, I can **click any queue item to see its full service detail** so that
  **I can review notes, timing, and next steps in one view**
- As a **user**, I can **eventually filter the queue by asset category** so that **I can
  focus on a subset of my fleet**
- As a **user**, I can **eventually complete, reschedule, or snooze service items** so
  that **I can close out work and advance the schedule**

## Acceptance Criteria

- [ ] The dashboard displays a greeting, date, and total fleet count
- [ ] Three stat counters are shown: Overdue, Due soon, On track
- [ ] The service queue is ordered from most urgent to least urgent
- [ ] The most urgent item is selected by default when the page loads
- [ ] Clicking a queue row selects that item and shows its detail
- [ ] The detail view shows: status label, asset name, asset ID, meter reading, last
      service date, service description, recurrence interval, estimated time,
      location/where, assignee, notes
- [ ] Category filter chips may be present as visual placeholders, but filtering is
      not required for the WIP version
- [ ] Service action controls may be present as visual placeholders, but they must not
      imply completed service workflows
- [ ] On mobile, the selected queue row expands inline to show compact service details
- [ ] The page title is set to "FieldOps — Home"

## Edge Cases & Error States

| Scenario                                   | Expected Behavior                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Empty fleet (no assets / no service queue) | [NOT SPECIFIED: no empty state has been defined for the WIP version]                    |
| All assets on track (no overdue or soon)   | Overdue and Due soon counters show 0                                                    |
| Selected item is the most-urgent item      | Detail card header shows "Next up" instead of "Selected"                                |
| Mobile viewport                            | Detail card is hidden; selected queue row expands inline with compact detail            |
| Action buttons clicked                     | [NOT SPECIFIED: service actions are future work]                                        |
| Filter chips clicked                       | [NOT SPECIFIED: filtering is future work]                                               |
| "Add service" clicked                      | [NOT SPECIFIED: service creation is future work]                                        |
| "View asset" clicked                       | [NOT SPECIFIED: navigates to asset detail, but the destination page does not yet exist] |

## Flags

**NOT SPECIFIED — Empty state:** No empty state has been defined for a dashboard with
no assets or no service queue.

**NOT SPECIFIED — Action behavior:** "Mark complete", "Reschedule", "Snooze", and "View
asset" represent the future interaction model but are not part of the completed feature
yet.

**NOT SPECIFIED — Filter chip behavior:** The intended behavior is to filter the queue
to a single category; the count in the "All" chip should reflect the total.

**NOT SPECIFIED — Real data integration:** When real data is wired, the following must
be resolved: the data model for service schedule (due dates, recurrence, last-service
meter), how urgency is computed, how status (overdue/soon/ok) is derived, and what user
name appears in the greeting. This will also require a backing **API capability spec**
under `apps/api/specs/features/` for any new endpoints.

**REVIEW NEEDED — "Lawn" / "Grounds" category:** The dashboard includes a "Grounds"
category that does not correspond to any creatable asset type (which are vehicle,
property, equipment). It is unclear whether "Grounds" is a planned fourth type or
prototype-only category.

**REVIEW NEEDED — Placeholder user identity:** The greeting uses a placeholder user
name and date. The finished feature needs to define how the authenticated user's name
and current date should appear.

**REVIEW NEEDED — Roadmap user stories in current spec:** Several user stories use
"eventually" phrasing (filter the queue, complete/reschedule/snooze items). These
describe future work, not the current WIP feature. They should be moved to a roadmap
section or a separate future spec to avoid inflating the apparent scope.

**NOT SPECIFIED — Telemetry contract not referenced:** When real data is wired and API
endpoints are added, each must be registered in the operation name mapping and any new
domain events must have telemetry handlers, per the API
[telemetry.md](../../../api/specs/cross-cutting/telemetry.md) integration contract. The
contract lands in the backing API feature spec, not here.

**NOT SPECIFIED — Error handling not referenced:** When real data is wired, the
dashboard will make API calls whose error states must be documented per the web
[error-handling.md](../cross-cutting/error-handling.md) spec. No error states are
defined for any data-loading scenario yet.

## Out of Scope

- Service scheduling data model and CRUD (prerequisite for the real data layer; an API
  capability spec)
- Reminder delivery (notifications, email)
- Multi-user or team assignment beyond the `assignee` display field
- Completed service history view
- Snooze and reschedule dialogs
- Asset detail page ("View asset" destination)
