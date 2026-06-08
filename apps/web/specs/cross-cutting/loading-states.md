---
audience: web contributors
purpose: canonical async UI state pattern for web features
source: this file
date: 2026-06-08
---

# Loading States (Web) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/web`
**Applies To:** All web features with async data (fetching or mutating)

---

## Summary

All async data operations in the frontend use React Query. Features must handle
three observable states for reads (loading, error, data) and two for writes
(pending, error). The UI must never show a blank or broken state — every async path
requires an explicit treatment. This is a web-only concern.

## Canonical Behavior

**Reads (queries):**

Use `useQuery()`. Map states as follows:

| State                     | UI treatment                                            |
| ------------------------- | ------------------------------------------------------- |
| `isPending`               | Loading indicator with a title and descriptive message  |
| `isError`                 | Error state with a retry action                         |
| `data` (populated)        | Render content                                          |
| `data` (empty collection) | Empty state with a call-to-action; this is not an error |

**Writes (mutations):**

Use `useMutation()`:

- `isPending` → disable the submit control and update its label (e.g., "Saving...")
- `isError` → show an inline error banner; map field errors to individual inputs via
  the feature's error-mapping function (see [error-handling.md](./error-handling.md))
- On success → invalidate the relevant query cache, then navigate or close
- When the user modifies input after a failed submit → call `mutation.reset()` to
  clear the error state

**Empty state:** An empty collection is not an error. It must render an explicit
empty state with a call-to-action pointing to the creation flow.

## Feature Integration Contract

Every web feature spec must document:

- The loading state treatment for each async read (what appears during `isPending`).
- The error state treatment for each async read (what appears, whether retry is
  offered).
- The empty state treatment for any collection view.
- Whether the feature disables or relabels controls during mutation `isPending`.
- How mutation errors are cleared when the user resumes editing.

## Exceptions

| Feature   | Deviation                                                                                | Reason                                                                                        |
| --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Auth flow | Uses three-value session state (`undefined` / `null` / `Session`) instead of React Query | Auth lifecycle drives routing before React Query context is available; it is not a data query |

## Anti-Patterns

- **Rendering nothing during `isPending`:** Every async branch must produce visible
  UI. A blank area while data loads is a bug.
- **Using the three-value session pattern for feature data:** That pattern is confined
  to `AuthFlow.tsx`. Feature data must use React Query.
- **Ignoring the empty-collection case:** `data.items ?? []` being empty is a distinct
  UI state — rendering an empty list without an empty state is a poor experience.
- **Leaving mutation errors visible after the user corrects input:** Call
  `mutation.reset()` when the user modifies input after a failed submit.

## Known Issues

- `HFAssetsState` (the loading/error/empty state component) is defined inside the
  assets feature and not yet part of the design system. A second list feature would
  need to either import from the wrong layer or duplicate the component. Future work:
  lift into `design/` or a shared component layer.
- Two distinct async state paradigms coexist in the codebase: React Query (canonical)
  and the three-value session state in `AuthFlow.tsx` (exception). The exception is
  documented above, but developers new to the codebase may reach for the wrong
  pattern without knowing which applies where.
