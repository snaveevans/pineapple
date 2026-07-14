---
audience: [who reads this spec]
purpose: [what this feature does — one line]
source: this file
date: YYYY-MM-DD
---

# [Feature Name]

**Status:** `draft` | `wip` | `review` | `in-progress` | `active` | `deprecated`
**Owner:** [PM or team name]
**Related Specs:** [cross-cutting specs this feature references]

---

## Summary

One paragraph. What this feature does and the user problem it solves. No implementation details.

## User Stories

- As a **[role]**, I can **[action]** so that **[outcome]**

## Acceptance Criteria

<!-- These boxes are the live implementation checklist: check a box (`- [x]`) only when the
behavior is implemented AND covered by a test on `main`. Every criterion carries exactly one
slice tag (`S1`…) from the Delivery Plan below — so each box has a home and "slice done = its
tagged boxes are all `[x]`." A criterion that resists a single tag is too coarse — split it.
Each slice PR checks off only its own boxes. See docs/specs/SPECS.md. -->

- [ ] `S1` [Specific, testable behavior]
- [ ] `S1` [Another testable criterion]

## Delivery Plan

<!-- The slices this feature ships in — independently-reviewable increments, each normally a
GitHub issue/PR (see Backlog in SPECS.md). Required. For a single-slice feature, replace the
table with one line: "Single slice — the whole feature (`S1`)." A slice is done when its tagged
criteria are all `[x]` with tests; the feature reaches `active` only when no `[ ]` remain. The
Issue column may be blank/`—` until an issue exists. Web-only slices whose criteria live in a
sibling spec (or docs/web/FEATURES.md) may carry no tags here — note that in Scope. -->

| Slice | Scope                      | Issue | Depends on |
| ----- | -------------------------- | ----- | ---------- |
| `S1`  | [what this slice delivers] | #—    | —          |
| `S2`  | [next increment]           | #—    | `S1`       |

## Edge Cases & Error States

| Scenario   | Expected Behavior   |
| ---------- | ------------------- |
| [scenario] | [expected behavior] |

## Telemetry

**Request telemetry:** `[METHOD] [/path]` maps to the `[OperationName]` operation via `createTechnicalTelemetryMiddleware`. See [telemetry.md](../cross-cutting/telemetry.md) for the full data point shape. _(If no API calls: "None — this feature makes no API calls." If the route is new, add it to the operation name mapping in `technicalTelemetry.ts` and update [telemetry.md](../cross-cutting/telemetry.md).)_

**Domain events:** _(If none: "None — [read operation / frontend-only / etc.]." If yes: "[EventName] published on [condition]; captured by [HandlerName] (dataset: [dataset_name]). Full blobs/doubles contract defined in [telemetry.md](../cross-cutting/telemetry.md).")_

## Out of Scope

- [Explicitly what this feature does NOT handle]

## Open Questions

- [ ] [Question — owner — target resolution date]
