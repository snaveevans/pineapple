---
name: asset-library
description: Asset listing screen — fetching, presenting, and navigating the user's full asset collection
metadata:
  type: feature
---

# Asset Library

**Status:** draft
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-03
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md)

---

## Summary

The Asset Library is the primary day-to-day screen for authenticated users. It lives at `/app/assets` and shows every non-archived asset the user owns. Assets are fetched live from the API and displayed as cards. The screen also serves as the entry point for adding a new asset.

## User Stories

- As an **authenticated user**, I can **see all of my assets in one place** so that **I know what I'm tracking**
- As a **user with no assets**, I can **see an empty state with a prompt to add one** so that **I know how to get started**
- As a **user**, I can **click "Add asset"** so that **I can create a new asset from the library**
- As a **user**, I can **retry if the asset load fails** so that **a transient error doesn't leave me stuck**

## Acceptance Criteria

- [ ] Assets are fetched from the asset list API when the page loads
- [ ] Only the authenticated user's own assets are returned (ownership enforced server-side)
- [ ] While loading, a "Loading assets" message is shown
- [ ] On error (non-401), an "Assets could not be loaded" message is shown with a "Try again" button
- [ ] On 401, the user is redirected to `/login` (replace); no retry is attempted
- [ ] When assets exist, each asset displays: name, displayId (first 8 chars of the asset ID, uppercased), type-specific summary, and a thumbnail
- [ ] Vehicle summary format: `"${year} ${make} ${model}"`
- [ ] Property summary format: `"${street}, ${city}, ${state}"`
- [ ] Equipment summary format: `"${manufacturer} ${modelNumber}"` if either present; otherwise `serialNumber`; otherwise `"Equipment details not added"`
- [ ] The header shows the total asset count ("N things you take care of") and an "Add asset" button
- [ ] When the asset list is non-empty, an "Add an asset" shortcut appears at the end of the list
- [ ] The empty state shows "No assets yet" with a description and an "Add asset" link
- [ ] The toolbar renders (with search input and filter chips showing counts) but all controls are disabled
- [ ] On wider viewports, assets are displayed as a tile grid; on mobile, assets are displayed as a row list
- [ ] 401 errors redirect to login without repeated retry attempts; transient non-401 errors may retry briefly before the error state is shown

## Edge Cases & Error States

| Scenario                                                   | Expected Behavior                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Zero assets                                                | Empty state with "No assets yet" and add-asset CTA                             |
| One or more assets                                         | Tile grid on wider viewports, row list on mobile; add shortcut appended at end |
| API 401                                                    | Redirect to `/login` (replace history)                                         |
| API error (non-401), first failure                         | The page may retry briefly before showing the error state                      |
| API error after retries                                    | Error state with "Assets could not be loaded" and "Try again" button           |
| "Try again" clicked                                        | The asset list is requested again                                              |
| Asset with no manufacturer, model number, or serial number | Summary shows "Equipment details not added"                                    |

## Telemetry

**Request telemetry:** `GET /api/assets` maps to the `ListAssets` operation via `createTechnicalTelemetryMiddleware`. See [telemetry.md](../cross-cutting/telemetry.md) for the full data point shape.

**Domain events:** None. Read operations are excepted from domain event telemetry per [telemetry.md](../cross-cutting/telemetry.md).

## Flags

**REVIEW NEEDED — View toggle not yet wired:** The toolbar renders a grid/list toggle button, but it is disabled. The CSS currently handles layout selection responsively (grid on wider viewports, rows on mobile). The toggle should be wired to allow users to manually override the responsive default.

**NOT SPECIFIED — Sorting and filtering:** The toolbar renders category filter chips (All / Vehicles / Equipment / Properties) with counts, but they are disabled. No sorting controls are present.

**NOT SPECIFIED — Search:** A search input is rendered in the toolbar but is disabled.

**NOT SPECIFIED — Asset detail navigation:** Grid and row cards are rendered as `<article>` elements, not links. There is no navigation to an individual asset detail page from this screen.

**NOT SPECIFIED — Singular/plural in header count copy:** The header reads "N things you take care of" but no handling is defined for N = 1 ("1 things" is broken copy). The singular form needs to be specified.

**NOT SPECIFIED — Thumbnail fallback:** Each grid card is described as showing a thumbnail, but no behavior is defined for assets that have no image.

**NOT SPECIFIED — Filter chip count data source:** The toolbar renders category filter chips with counts while all controls are disabled. It is not specified whether the counts are computed from the loaded asset list client-side or fetched separately from the API.

**NOT SPECIFIED — `displayId` format source:** The grid card shows the first 8 characters of the asset ID, uppercased. This is derived from the backend `AssetId` format, but the spec states the rule inline rather than referencing the data model. If the ID format changes, this spec would silently diverge.

**NOT SPECIFIED — `ListAssets` result count not captured in telemetry:** Request telemetry confirms `GET /api/assets` was called and succeeded, but does not record how many assets were returned. Fleet size per user is a core metric for this product and is not currently observable from telemetry.

## Out of Scope

- Asset detail view (individual asset page)
- Filtering or searching assets (toolbar controls are disabled/stubbed)
- Manual grid vs. list view toggle (toggle rendered but not yet wired)
- Archiving or deleting assets from this screen
- Service status or urgency indicators on the library cards (present on the Dashboard)
- Pagination or infinite scroll
