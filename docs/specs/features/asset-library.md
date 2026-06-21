---
name: asset-library
description: Asset listing screen — fetching, presenting, filtering, and navigating the user's full asset collection
metadata:
  type: feature
---

# Asset Library

**Status:** review
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-21
**Related Specs:** [app-search.md](./app-search.md), [authentication.md](../cross-cutting/authentication.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md)

---

## Summary

The Asset Library is the primary day-to-day screen for authenticated users. It lives at `/app/assets` and shows every non-archived asset the user owns. Assets are fetched live from the API and displayed as cards that link to each asset's maintenance page. The screen also serves as the entry point for adding a new asset.

Beyond listing, the library lets the user **narrow the list by asset category** (All / Vehicles / Equipment / Properties) and **switch between a grid and a list layout**. There is no inline search box on this screen — finding a specific asset by name or detail is handled globally by [App Search](./app-search.md) (`cmd/ctrl+K` or the top-bar button), so the library toolbar focuses on browsing and filtering rather than search.

> UX intent for this screen is documented in [`docs/web/FEATURES.md`](../../web/FEATURES.md). The implemented API contract is authoritative in `openapi.json`.

## User Stories

- As an **authenticated user**, I can **see all of my assets in one place** so that **I know what I'm tracking**
- As a **user with no assets**, I can **see an empty state with a prompt to add one** so that **I know how to get started**
- As a **user**, I can **filter the list to one asset category** so that **I can focus on just the vehicles, equipment, or properties I care about**
- As a **user**, I can **see how many assets fall in each category** so that **I understand the makeup of my fleet at a glance**
- As a **user**, I can **switch between a grid and a list layout** so that **I can choose the density that suits the moment**
- As a **user**, I can **open any asset's maintenance page from its card** so that **I can act on it without a separate lookup**
- As a **user**, I can **click "Add asset"** so that **I can create a new asset from the library**
- As a **user**, I can **retry if the asset load fails** so that **a transient error doesn't leave me stuck**

> Finding a specific asset by name or metadata is **not** a story for this screen — it is owned by [App Search](./app-search.md).

## Acceptance Criteria

**Fetch & presentation**

- [ ] Assets are fetched from the asset list API when the page loads
- [ ] Only the authenticated user's own non-archived assets are returned (ownership enforced server-side)
- [ ] When assets exist, each asset displays: name, displayId (first 8 chars of the asset ID, uppercased), type-specific summary, and a thumbnail
- [ ] Vehicle summary format: `"${year} ${make} ${model}"`
- [ ] Property summary format: `"${street}, ${city}, ${state}"`
- [ ] Equipment summary format: `"${manufacturer} ${modelNumber}"` if either present; otherwise `serialNumber`; otherwise `"Equipment details not added"`
- [ ] Each asset card is a link to that asset's maintenance page (`/app/assets/:id/maintenance`)
- [ ] The header shows the total asset count with correct grammar: **"1 thing you take care of"** (singular) and **"N things you take care of"** (plural, including N = 0), plus an "Add asset" button

**Category filter chips**

- [ ] The asset list API returns **per-category counts** in its response (`counts: { all, vehicle, equipment, property }`), computed server-side over the same owner-scoped, non-archived set that is returned, so the client renders the counts rather than recomputing them from raw data (ADR-0009). `counts.all` equals the length of the returned `assets` array
- [ ] The toolbar renders a fixed set of category chips — **All / Vehicles / Equipment / Properties** — each showing its count from the API response (the client does not recompute counts from raw data)
- [ ] A chip whose count is `0` still renders and is still selectable
- [ ] Selecting a chip filters the **already-loaded** list **client-side** with no new API request; the selected category is ephemeral client UI state and is never sent to the API
- [ ] "All" is selected by default and shows every loaded asset
- [ ] The active chip is visually indicated
- [ ] When the selected category has no matching assets (but the library is non-empty), a **filtered-empty state** is shown that names the category and offers a way forward (clear the filter or add an asset)

**Grid / list view**

- [ ] The toolbar renders a grid/list view toggle on viewports where both layouts are available (wider/desktop viewports)
- [ ] On those viewports, **grid is the default**; selecting "list" switches to the row layout, and the choice **persists across visits in the same browser**
- [ ] On mobile, assets always render as a row list and the view toggle is **not shown** (the stored preference does not apply)
- [ ] The active view is visually indicated
- [ ] The selected category filter applies to whichever layout is active; the "Add an asset" shortcut appends to the end of the (filtered) list when at least one asset matches

**Toolbar visibility & states**

- [ ] The filter chips and view toggle are shown **only when the asset list has loaded with at least one asset** — they are not rendered during loading, error, or the zero-asset empty state
- [ ] There are **no disabled or non-functional controls** on the screen: every rendered control performs its action
- [ ] While loading, a "Loading assets" message is shown
- [ ] On error (non-401), an "Assets could not be loaded" message is shown with a "Try again" button; transient non-401 errors may retry briefly before the error state is shown
- [ ] On 401, the user is redirected to `/login` (replace); no retry is attempted
- [ ] The empty state (zero assets owned) shows "No assets yet" with a description and an "Add asset" link

## Edge Cases & Error States

| Scenario                                                   | Expected Behavior                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Zero assets owned                                          | Empty state with "No assets yet" and add-asset CTA; no toolbar (chips/view) shown                |
| One asset                                                  | Header reads "1 thing you take care of"                                                          |
| One or more assets                                         | Grid (desktop default) or row list; chips + view toggle shown; add shortcut appended at list end |
| Category chip selected with ≥1 match                       | List filters client-side to that category; no new request                                        |
| Category chip selected with 0 matches (library non-empty)  | Filtered-empty state naming the category, with a way to clear the filter or add an asset         |
| "All" chip selected                                        | Every loaded asset is shown                                                                      |
| View toggle → "list" on desktop                            | Row layout shown; preference persisted for next visit                                            |
| Mobile viewport                                            | Always row list; no view toggle; stored grid/list preference ignored                             |
| API 401                                                    | Redirect to `/login` (replace history)                                                           |
| API error (non-401), first failure                         | The page may retry briefly before showing the error state                                        |
| API error after retries                                    | Error state with "Assets could not be loaded" and "Try again" button                             |
| "Try again" clicked                                        | The asset list is requested again                                                                |
| Asset with no manufacturer, model number, or serial number | Summary shows "Equipment details not added"                                                      |

## API Shape (design target)

The implemented contract is authoritative in `openapi.json` once built; this describes the intended design, not a second source of truth.

- **Request:** `GET /api/assets` — no query parameters. Authenticated (session or `DEV_AUTH_EMAIL` locally). The category filter is **not** a request parameter; it is applied client-side.
- **Response 200:** the existing `{ "assets": Asset[] }` envelope gains a sibling `counts` object:

  ```jsonc
  {
    "assets": [
      /* non-archived assets owned by the requester */
    ],
    "counts": { "all": 6, "vehicle": 2, "equipment": 3, "property": 1 },
  }
  ```

  `counts` mirrors the dashboard's `queueCountsByCategory` shape (`{ all, vehicle, equipment, property }`, non-negative integers). It is computed by the API over the same set returned in `assets`, so `counts.all === assets.length` and each per-type count equals the number of returned assets of that type.

- **Errors:** 401 (`UnauthorizedError`) for an unauthenticated request; 500 (`InvariantError`) for an unexpected failure. No 422 (the endpoint takes no input).

## Telemetry

**Request telemetry:** `GET /api/assets` maps to the existing **`ListAssets`** operation via `createTechnicalTelemetryMiddleware`. Returning `counts` on the same response does **not** add an endpoint and requires **no new operation mapping**. See [telemetry.md](../cross-cutting/telemetry.md) for the data point shape.

**Domain events:** None. Read operations are excepted from domain event telemetry per [telemetry.md](../cross-cutting/telemetry.md).

## Flags

**REVIEW NEEDED — `ListAssets` result/fleet-size count not captured in telemetry:** Request telemetry confirms `GET /api/assets` was called and succeeded but does not record how many assets were returned, nor the per-category breakdown. Fleet size per user is a core product metric. The API now computes `counts` internally, so the value exists server-side; surfacing it in telemetry still requires the same operation-specific measurement hook flagged in [app-search.md](./app-search.md) (the fixed request-telemetry data point cannot express per-operation measures). **Numeric only** — no PII. Owner: engineering. Decide whether to land with this change or defer with the app-search measurement work.

**NOT SPECIFIED — Thumbnail fallback:** Each card shows a thumbnail via the shared `HFAssetThumb` component, but no fallback behavior is formally specified for assets with no image. Out of scope for this change; revisit when asset images land.

**NOT SPECIFIED — `displayId` format source:** The card shows the first 8 characters of the asset ID, uppercased. This is derived from the backend `AssetId` format, but the spec states the rule inline rather than referencing the data model. If the ID format changes, this spec would silently diverge.

## Out of Scope

- **Searching assets from this screen** — handled globally by [App Search](./app-search.md) (`cmd/ctrl+K` / top-bar). The inline toolbar search input is removed, not wired.
- **Sorting controls** — no sort affordance is planned in this change; the list order is the API's default. A sort facet would be a separate spec.
- **Server-side category filtering / a `?type=` query param** — filtering is client-side over the single loaded list (counts come from the API per ADR-0009). Revisit only if the fleet grows large enough to warrant paging.
- Asset detail view beyond the maintenance-page deep link
- Archiving or deleting assets from this screen
- Service status or urgency indicators on the library cards (present on the Dashboard)
- Pagination or infinite scroll
