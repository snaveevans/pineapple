---
audience: [who reads this spec]
purpose: [what this feature does — one line]
source: this file
date: YYYY-MM-DD
metadata:
  type: feature
  package: [api | web]
---

<!--
Where does this file go?
  - API capability (endpoint + validation/ownership/telemetry) → apps/api/specs/features/
  - UX (a screen/flow)                                         → apps/web/specs/features/
A full-stack feature is TWO specs (one per package) that link to each other via the
counterpart line below. Cross-cutting links below are relative to the package the
spec lives in; delete the ones that don't apply to your package.
-->

# [Feature Name] ([API | Web])

**Status:** `draft` | `wip` | `review` | `active` | `deprecated`
**Owner:** [PM or team name]
**Package:** `apps/[api | web]`
**Counterpart:** [link to the other package's spec, or "— (this package only)"]
**Related Specs:** [package cross-cutting specs] · [universal contracts if at the API↔web seam]

---

## Summary

One paragraph. What this feature does and the user problem it solves. For an API
capability, what the endpoint does and who may call it. For UX, what the screen lets
the user accomplish. No implementation details. Link to the counterpart for the other
half.

## User Stories <!-- UX specs; optional for pure API capabilities -->

- As a **[role]**, I can **[action]** so that **[outcome]**

## Acceptance Criteria

- [ ] [Specific, testable behavior]
- [ ] [Another testable criterion]

## Edge Cases & Error States

| Scenario   | Expected Behavior   |
| ---------- | ------------------- |
| [scenario] | [expected behavior] |

## Telemetry <!-- API specs only; the web package has no telemetry yet -->

**Request telemetry:** `[METHOD] [/path]` maps to the `[OperationName]` operation via
`createTechnicalTelemetryMiddleware`. See `apps/api/specs/cross-cutting/telemetry.md`
for the full data point shape. _(If the route is new, add it to the operation name
mapping and update telemetry.md.)_

**Domain events:** _(None, or: "[EventName] published on [condition]; captured by
[HandlerName] (dataset: [dataset_name]). Full blobs/doubles contract defined below or
in telemetry.md.")_

## Out of Scope

- [Explicitly what this feature does NOT handle — including the half owned by the
  counterpart package]

## Open Questions

- [ ] [Question — owner — target resolution date]
