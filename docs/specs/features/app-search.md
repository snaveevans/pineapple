---
audience: engineering, product
purpose: a global, server-side asset search endpoint that lets a user find one of their assets by name or key metadata from anywhere in the app
source: this file
date: 2026-06-21
---

# App Search

**Status:** active
**Owner:** engineering
**Last Updated:** 2026-06-21
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [permissions.md](../cross-cutting/permissions.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [telemetry.md](../cross-cutting/telemetry.md)

---

## Summary

As a fleet grows, scanning the Asset Library to reach one asset gets slow. App Search
gives the authenticated user a single endpoint — `GET /api/search?q=…` — that returns
their own assets matching a free-text query against the asset name and its key
metadata, ranked and ready to render as a jump list. The search is global to the
authenticated app shell rather than tied to a single screen, and returns a lightweight
result model (id, name, type, and a computed summary line) displayed in a global app-shell
search UI that deep-links into the asset. The desktop UI is a command palette opened from the
top bar or `cmd+k` / `ctrl+k`; mobile uses a full-screen search sheet. The detailed web
interaction behavior is documented in [`docs/web/FEATURES.md`](../../web/FEATURES.md).

## User Stories

- As an **authenticated user**, I can **search my assets by name or key details from anywhere in the app** so that **I can jump straight to an asset without scanning the library**
- As a **user**, I can **type a partial or multi-word query and still get matches** so that **I don't need to know the exact name**
- As a **user with no matching assets**, I can **get a clear empty result rather than an error** so that **I know search worked but found nothing**
- As a **user**, I can **trust that only my own assets are ever returned** so that **search respects ownership**
- As a **user**, I can **recover from a failed search** so that **a transient error or an expired session doesn't strand me**

## Acceptance Criteria

- [ ] `GET /api/search?q=<query>` returns only the authenticated requester's own assets (ownership enforced server-side via `ownerId`)
- [ ] Only **non-archived** assets are eligible for results
- [ ] `q` is **required** and trimmed; missing, empty, or whitespace-only `q` returns **422 `ValidationError`**
- [ ] `q` longer than **100 characters** returns **422 `ValidationError`**
- [ ] Matching is **case-insensitive substring** ("contains"), not prefix-only and not fuzzy
- [ ] Matching covers: asset `name`, and per-type metadata — vehicle `make` / `model` / `year` / `vin`; property `nickname` / `address.street` / `city` / `state` / `postalCode` / `country`; equipment `manufacturer` / `modelNumber` / `serialNumber`
- [ ] Multiple whitespace-separated terms are combined with **AND** — every term must match somewhere in the asset's searchable text; each term may match any searchable field (e.g. `ram 2500` matches make "Ram" + model "2500")
- [ ] Each result includes `id`, `name`, `type`, and a computed `summary` subtitle using the same formatting rules as Asset Library cards (see below)
- [ ] Results are ranked **name matches first**, then **most-recently-updated** (`updatedAt` descending) as the tiebreak; ordering is deterministic
- [ ] Results are capped at **20**; there is no pagination
- [ ] No matches (or the user has no assets at all) returns **200** with an empty results array — never 404
- [ ] A successful response is wrapped in a `{ results: [...] }` envelope (mirrors `{ assets: [...] }`)
- [ ] The authenticated app shell exposes a top-bar search entry point and a `cmd+k` / `ctrl+k` shortcut
- [ ] Desktop search renders a keyboard-navigable command palette; mobile search renders a full-screen sheet
- [ ] The UI debounces non-empty input, presents loading, empty, error, and ranked-result states, and opens a selected asset's maintenance page
- [ ] A 401 response closes search and replaces the current route with `/login`; other request failures expose a retryable error state
- [ ] Validation happens at the **Zod HTTP edge** (ADR-0007); the request/response schemas live in `apps/api/src/api/schemas/` and are the source for `openapi.json`
- [ ] `GET /api/search` maps to the **`SearchAssets`** operation in `technicalTelemetry.ts` (it falls through to `Unknown` until added)
- [ ] The **raw query string is never written to telemetry** (PII anti-pattern — see [telemetry.md](../cross-cutting/telemetry.md))

### Computed `summary` (matches Asset Library card formatting)

- Vehicle: `"${year} ${make} ${model}"`
- Property: `"${street}, ${city}, ${state}"`
- Equipment: `"${manufacturer} ${modelNumber}"` if either present; otherwise `serialNumber`; otherwise `"Equipment details not added"`

> Per ADR-0009, the `summary` is computed in the application layer and returned by the
> API. Clients render it; they do not re-derive it from raw metadata. The deep-link
> target (`/app/assets/:id/maintenance`) is derived from `id` on the client.

## API Shape (design target)

The implemented contract is authoritative in `openapi.json` once built; this describes
the intended design, not a second source of truth.

- **Request:** `GET /api/search?q=<string>` — `q` required, trimmed, 1–100 chars. Authenticated (session or `DEV_AUTH_EMAIL` locally).
- **Response 200:** `{ "results": SearchResult[] }`, where `SearchResult = { id, name, type, summary }`. Empty array when nothing matches.
- **Errors:** 422 (`ValidationError`) for an invalid `q`; 401 (`UnauthorizedError`) for an unauthenticated request; 500 (`InvariantError`) for an unexpected failure.

## Edge Cases & Error States

| Scenario                                            | Expected Behavior                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `q` missing, empty, or whitespace-only              | 422 `ValidationError`. The client suppresses the call until there is ≥1 non-space char.      |
| `q` longer than 100 characters                      | 422 `ValidationError`.                                                                       |
| Multi-term query (`ram 2500`)                       | All terms must match (AND); each term may match any searchable field.                        |
| No asset matches                                    | 200 with `{ "results": [] }`; client shows a "no matches" state.                             |
| User owns no assets at all                          | 200 with `{ "results": [] }` (indistinguishable from no-match by design).                    |
| More than 20 assets match                           | Top 20 by ranking returned; no pagination, no total count.                                   |
| An archived asset would otherwise match             | Excluded — archived assets are never returned.                                               |
| Query matches another user's asset                  | Never returned — results are scoped to the requester's `ownerId`.                            |
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
