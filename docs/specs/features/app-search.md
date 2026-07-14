---
audience: engineering, product
purpose: a global, server-side asset search endpoint that lets a user find one of their assets by name or key metadata from anywhere in the app
source: this file
date: 2026-06-21
---

# App Search

**Status:** in-progress
**Owner:** engineering
**Last Updated:** 2026-07-13
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [permissions.md](../cross-cutting/permissions.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [telemetry.md](../cross-cutting/telemetry.md), [teams-foundation.md](./teams-foundation.md)

---

## Summary

As a fleet grows, scanning the Asset Library to reach one asset gets slow. App Search
gives the authenticated user a single endpoint — `GET /api/search?q=…` — that returns
the assets they can access matching a free-text query against the asset name and its key
metadata, ranked and ready to render as a jump list. The searchable set is every
non-archived asset the requester can access: the assets they **own** and the assets a
teammate has **shared with their team** ([teams-foundation.md](./teams-foundation.md)).
The search is global to the authenticated app shell rather than tied to a single screen,
and returns a lightweight result model (id, name, type, a computed summary line, and a
`sharing` descriptor so a shared result can be marked and attributed) displayed in a global
app-shell search UI that deep-links into the asset. The desktop UI is a command palette
opened from the top bar or `cmd+k` / `ctrl+k`; mobile uses a full-screen search sheet. The
detailed web interaction behavior is documented in [`docs/web/FEATURES.md`](../../web/FEATURES.md).

## User Stories

- As an **authenticated user**, I can **search my assets by name or key details from anywhere in the app** so that **I can jump straight to an asset without scanning the library**
- As a **user**, I can **type a partial or multi-word query and still get matches** so that **I don't need to know the exact name**
- As a **user with no matching assets**, I can **get a clear empty result rather than an error** so that **I know search worked but found nothing**
- As a **user**, I can **trust that only assets I can access are ever returned** so that **search respects ownership and team sharing**
- As a **team member**, I can **find assets shared with my team from search and see they're shared** so that **I can jump to a teammate's shared asset the same way as my own**
- As a **user**, I can **recover from a failed search** so that **a transient error or an expired session doesn't strand me**

## Acceptance Criteria

_Each criterion carries exactly one slice tag (`S1`…`S4`) from the [Delivery Plan](#delivery-plan)._

- [ ] `S2` `GET /api/search?q=<query>` returns only assets the authenticated requester can access — those they **own** and those **currently shared with their team** ([teams-foundation.md](./teams-foundation.md), [permissions.md](../cross-cutting/permissions.md)); an asset neither owned by nor shared with the requester is never returned
- [ ] `S1` Only **non-archived** assets are eligible for results
- [ ] `S1` `q` is **required** and trimmed; missing, empty, or whitespace-only `q` returns **422 `ValidationError`**
- [ ] `S1` `q` longer than **100 characters** returns **422 `ValidationError`**
- [ ] `S1` Matching is **case-insensitive substring** ("contains"), not prefix-only and not fuzzy
- [ ] `S1` Matching covers: asset `name`, and per-type metadata — vehicle `make` / `model` / `year` / `vin`; property `nickname` / `address.street` / `city` / `state` / `postalCode` / `country`; equipment `manufacturer` / `modelNumber` / `serialNumber`
- [ ] `S1` Multiple whitespace-separated terms are combined with **AND** — every term must match somewhere in the asset's searchable text; each term may match any searchable field (e.g. `ram 2500` matches make "Ram" + model "2500")
- [ ] `S1` Each result includes `id`, `name`, `type`, and a computed `summary` subtitle using the same formatting rules as Asset Library cards (see below)
- [ ] `S3` Each result additionally includes the computed **`sharing`** descriptor (`scope`, `isOwner`, and `ownerDisplayName` when the asset is shared with the requester) per ADR-0009, so a shared result can be marked and its owner attributed
- [ ] `S4` A result for an asset shared with the requester by a teammate shows a "shared by {ownerDisplayName}" marker; a result the requester owns and has shared shows a "shared with team" marker; a personal asset shows none
- [ ] `S1` Results are ranked **name matches first**, then **most-recently-updated** (`updatedAt` descending) as the tiebreak; ordering is deterministic
- [ ] `S1` Results are capped at **20**; there is no pagination
- [ ] `S1` No matches (or the user has no assets at all) returns **200** with an empty results array — never 404
- [ ] `S1` A successful response is wrapped in a `{ results: [...] }` envelope (mirrors `{ assets: [...] }`)
- [ ] `S1` The authenticated app shell exposes a top-bar search entry point and a `cmd+k` / `ctrl+k` shortcut
- [ ] `S1` Desktop search renders a keyboard-navigable command palette; mobile search renders a full-screen sheet
- [ ] `S1` The UI debounces non-empty input, presents loading, empty, error, and ranked-result states, and opens a selected asset's maintenance page
- [ ] `S1` A 401 response closes search and replaces the current route with `/login`; other request failures expose a retryable error state
- [ ] `S1` Validation happens at the **Zod HTTP edge** (ADR-0007); the request/response schemas live in `apps/api/src/api/schemas/` and are the source for `openapi.json`
- [ ] `S1` `GET /api/search` maps to the **`SearchAssets`** operation in `technicalTelemetry.ts` (it falls through to `Unknown` until added)
- [ ] `S1` The **raw query string is never written to telemetry** (PII anti-pattern — see [telemetry.md](../cross-cutting/telemetry.md))

### Computed `summary` (matches Asset Library card formatting)

- Vehicle: `"${year} ${make} ${model}"`
- Property: `"${street}, ${city}, ${state}"`
- Equipment: `"${manufacturer} ${modelNumber}"` if either present; otherwise `serialNumber`; otherwise `"Equipment details not added"`

> Per ADR-0009, the `summary` is computed in the application layer and returned by the
> API. Clients render it; they do not re-derive it from raw metadata. The deep-link
> target (`/app/assets/:id/maintenance`) is derived from `id` on the client.

## Delivery Plan

| Slice | Scope                                                                                                                                         | Issue                                                    | Depends on |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| `S1`  | Base search — `GET /api/search`, matching, ranking, command palette / mobile sheet. Shipped on `main` (see Flags: box reconciliation).        | —                                                        | —          |
| `S2`  | Visible-set scoping — the searchable set spans owned + team-shared assets, delivered by teams-foundation `S2`. Shipped on `main` (see Flags). | [#58](https://github.com/snaveevans/pineapple/issues/58) | `S1`       |
| `S3`  | `sharing` descriptor on search results — search's share of teams-foundation `S4`.                                                             | [#74](https://github.com/snaveevans/pineapple/issues/74) | `S2`       |
| `S4`  | Web shared markers on results — search's share of teams-foundation `S5`.                                                                      | [#59](https://github.com/snaveevans/pineapple/issues/59) | `S3`       |

## API Shape (design target)

The implemented contract is authoritative in `openapi.json` once built; this describes
the intended design, not a second source of truth.

- **Request:** `GET /api/search?q=<string>` — `q` required, trimmed, 1–100 chars. Authenticated (session or `DEV_AUTH_EMAIL` locally).
- **Response 200:** `{ "results": SearchResult[] }`, where `SearchResult = { id, name, type, summary, sharing }` and `sharing = { scope: "personal" | "team", isOwner: boolean, ownerDisplayName?: string }` (the `sharing` descriptor from [teams-foundation.md](./teams-foundation.md); `ownerDisplayName` present when the asset is shared with the requester). Empty array when nothing matches.
- **Errors:** 422 (`ValidationError`) for an invalid `q`; 401 (`UnauthorizedError`) for an unauthenticated request; 500 (`InvariantError`) for an unexpected failure.

## Edge Cases & Error States

| Scenario                                            | Expected Behavior                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `q` missing, empty, or whitespace-only              | 422 `ValidationError`. The client suppresses the call until there is ≥1 non-space char.      |
| `q` longer than 100 characters                      | 422 `ValidationError`.                                                                       |
| Multi-term query (`ram 2500`)                       | All terms must match (AND); each term may match any searchable field.                        |
| No asset matches                                    | 200 with `{ "results": [] }`; client shows a "no matches" state.                             |
| User can access no assets at all                    | 200 with `{ "results": [] }` (indistinguishable from no-match by design).                    |
| More than 20 assets match                           | Top 20 by ranking returned; no pagination, no total count.                                   |
| An archived asset would otherwise match             | Excluded — archived assets are never returned.                                               |
| Query matches an asset shared with the requester    | Returned like an owned asset, with its `sharing` marker and the owner's display name.        |
| Query matches an asset the requester cannot access  | Never returned — results are scoped to what the requester can access (owned + team-shared).  |
| Equipment match with no manufacturer/model #/serial | `summary` is `"Equipment details not added"`.                                                |
| Unauthenticated request (401)                       | Auth middleware returns 401; client redirects to `/login` (replace) per authentication spec. |
| Unexpected server error                             | 500 `InvariantError`; client shows a retryable error state.                                  |

## Telemetry

**Request telemetry:** `GET /api/search` maps to a new **`SearchAssets`** operation via
`createTechnicalTelemetryMiddleware`. This route is **new** — it must be added to the
operation-name mapping in `technicalTelemetry.ts` and to the mapping table in
[telemetry.md](../cross-cutting/telemetry.md), or it will fall through to `Unknown` and be
invisible. See [telemetry.md](../cross-cutting/telemetry.md) for the full data point shape.

**Domain events:** None. Search is a read operation and reads are excepted from domain-event
telemetry per [telemetry.md](../cross-cutting/telemetry.md).

## Flags

**REVIEW NEEDED — `S1`/`S2` boxes not yet reconciled with shipped code:** Base search (`S1`)
and visible-set scoping (`S2`, landed via teams-foundation `S2` /
[#58](https://github.com/snaveevans/pineapple/issues/58)) are implemented on `main` —
`GET /api/search` backed by `SearchAssets` (with `SearchAssets.test.ts`) and the app-shell
search UI (`AppSearch.tsx`, `AppSearch.test.tsx`). Their acceptance boxes were authored before
box-discipline and are still `[ ]`. A brownfield pass (`/spec-author`) should tick each
`S1`/`S2` box a test on `main` actually covers and unpick any that aren't yet true. The spec is
marked `in-progress` — `S1`/`S2` shipped, `S3` ([#74](https://github.com/snaveevans/pineapple/issues/74))
and `S4` ([#59](https://github.com/snaveevans/pineapple/issues/59)) pending — on that basis,
rather than left at `review`. Note: `SearchAssets.ts` currently carries a comment saying the
result intentionally omits the `sharing` descriptor; `S3` reverses that decision — remove the
comment when it lands. Owner: engineering.

**REVIEW NEEDED — Result-count and query-length measurement:** Result count per query and
query length are valuable product signals (and would close the "fleet size / result counts
not observable" gap noted in `asset-library.md`). The current request telemetry data point is
**fixed** and cannot express per-operation measures, so capturing these requires extending the
telemetry middleware with an operation-specific measurement hook. **Numeric only** — the raw
query text is user-supplied PII and must never be stored. Owner: engineering. Decide whether to
land this with the feature or defer to a follow-up.

**REVIEW NEEDED — Ranking precision:** "Name matches first, then `updatedAt` descending" is the
defined contract. Finer relevance scoring (weighting whole-word or leading matches, field
priority within metadata) is left to the implementer **provided ordering is deterministic** for
a given query and dataset.

**NOT SPECIFIED — Asset `type` as a match target:** Free-text matching covers `name` + metadata.
The literal `type` enum (`vehicle` / `property` / `equipment`) is intentionally **not** a
free-text match target; a type filter/facet belongs to a future filtering spec.

**RESOLVED — Relationship to the Asset Library toolbar search:** The previously disabled search
input on `/app/assets` is being **removed**, not wired — App Search is the single asset-search
affordance. See [asset-library.md](./asset-library.md) (Out of Scope) for that decision.

## Out of Scope

- Searching maintenance tasks, service records, users, or any entity other than assets
- Fuzzy / typo-tolerant matching, stemming, or synonyms
- Pagination, infinite scroll, or a total-match count beyond the returned results
- Sorting or filter controls (type facets, status, date)
- Including archived assets, or a toggle to include them
- Full-text search infrastructure (e.g. SQLite FTS5); case-insensitive substring matching is sufficient at current fleet scale — revisit if fleets grow large
- The Asset Library inline toolbar search input — being removed in favor of App Search (see [asset-library.md](./asset-library.md))
