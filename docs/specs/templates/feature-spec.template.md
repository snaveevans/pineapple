---
audience: [who reads this spec]
purpose: [what this feature does — one line]
source: this file
date: YYYY-MM-DD
---

# [Feature Name]

**Status:** `draft` | `wip` | `review` | `active` | `deprecated`
**Owner:** [PM or team name]
**Related Specs:** [cross-cutting specs this feature references]

---

## Summary

One paragraph. What this feature does and the user problem it solves. No implementation details.

## User Stories

- As a **[role]**, I can **[action]** so that **[outcome]**

## Acceptance Criteria

<!-- These boxes are the live implementation checklist: check a box (`- [x]`) only when the
behavior is implemented AND covered by a test on `main`. Large specs ship in slices (tracked as
GitHub issues); each PR checks off only the criteria it lands. See docs/specs/SPECS.md. -->

- [ ] [Specific, testable behavior]
- [ ] [Another testable criterion]

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
