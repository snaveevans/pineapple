---
audience: engineering
purpose: enrich API request telemetry with geographic origin and user identity; add anonymous page view tracking via Cloudflare Web Analytics
source: this file
date: 2026-06-17
---

# Telemetry Enrichment

**Status:** `draft`
**Owner:** engineering
**Last Updated:** 2026-06-17
**Related Specs:** [telemetry.md](../cross-cutting/telemetry.md), [authentication.md](../cross-cutting/authentication.md)

---

## Summary

The existing `pineapple_api_request_events` dataset captures every HTTP request but omits two signals the owner-operator needs: where the request originated and which user made it. This spec adds country of origin (from `request.cf.country`) and authenticated user identity to each API request data point under a new `v2` schema, preserving all existing field positions so v1 data remains queryable alongside v2. It also adds Cloudflare Web Analytics to the web app — a JS beacon that captures anonymous page views, visitor counts, geographic breakdown, and Core Web Vitals in the Cloudflare Dashboard, separate from Analytics Engine. The CSP in `apps/web/public/_headers` is updated to allow the beacon and its reporting endpoint.

## User Stories

- As the **owner-operator**, I can **see the country of origin for each API request** so that **I understand where the app is being used**
- As the **owner-operator**, I can **identify which user made each API request** so that **I can understand per-user API usage patterns**
- As the **owner-operator**, I can **see aggregate page views, visitor counts, and geographic breakdown in the Cloudflare Dashboard** so that **I have a baseline sense of how often the web app is being visited**

## Acceptance Criteria

### API request telemetry (v2 schema)

- [ ] Each API request data point written after this change includes a `country` field at `blobs[9]` containing the ISO 3166-1 alpha-2 code from `request.cf.country`
- [ ] Requests where `request.cf.country` is absent or empty write `"unknown"` to `blobs[9]`
- [ ] Each API request data point includes a `user_id` field at `blobs[10]` containing the authenticated user's `UserId` UUID when a session is resolved
- [ ] Unauthenticated requests write `"anonymous"` to `blobs[10]`
- [ ] The `schema_version` field (`blobs[8]`) is `"v2"` for all data points written after this change
- [ ] Existing v1 data points are not modified — `blob9 = 'v1'` remains a stable filter to exclude them from v2 queries
- [ ] `telemetry.md` is updated to reflect the v2 API request data point schema
- [ ] All telemetry failure guarantees remain intact — an AE write failure is logged with `console.error` and swallowed; it never affects the API response
- [ ] `telemetry.md` API request data point table is updated to the v2 schema
- [ ] `telemetry.md` Exceptions table replaces the `"Frontend — No telemetry"` row with a Cloudflare Web Analytics entry
- [ ] `telemetry.md` removes the `"No frontend telemetry"` Known Issue

### Cloudflare Web Analytics

- [ ] The Cloudflare Web Analytics beacon is present in `apps/web/index.html` with a valid Site Token
- [ ] Page view data appears in the Cloudflare Dashboard under Web Analytics for `pineapple.tylerevans.co`
- [ ] `script-src` in `apps/web/public/_headers` includes `https://static.cloudflareinsights.com`
- [ ] `connect-src` in `apps/web/public/_headers` includes `https://cloudflareinsights.com`
- [ ] No other CSP directives are changed

## API Request Telemetry v2 Schema

Dataset: `pineapple_api_request_events` (binding: `API_REQUEST_TELEMETRY`). Field positions from v1 are unchanged; `blobs[9]` and `blobs[10]` are additive.

| Field        | Name                 | v1                                               | v2                                                               |
| ------------ | -------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `indexes[0]` | —                    | Operation name                                   | Operation name (unchanged)                                       |
| `blobs[0]`   | `operation`          | Operation name                                   | (unchanged)                                                      |
| `blobs[1]`   | `route_pattern`      | Route pattern                                    | (unchanged)                                                      |
| `blobs[2]`   | `method`             | HTTP method                                      | (unchanged)                                                      |
| `blobs[3]`   | `status_class`       | `"2xx"`, `"4xx"`, `"5xx"`                        | (unchanged)                                                      |
| `blobs[4]`   | `status_code`        | HTTP status as string                            | (unchanged)                                                      |
| `blobs[5]`   | `outcome`            | `"success"`, `"failure"`, `"error"`              | (unchanged)                                                      |
| `blobs[6]`   | `error_name`         | Error constructor name, `"unknown"`, or `"none"` | (unchanged)                                                      |
| `blobs[7]`   | `authenticated`      | `"true"` or `"false"`                            | (unchanged)                                                      |
| `blobs[8]`   | `schema_version`     | `"v1"`                                           | `"v2"`                                                           |
| `blobs[9]`   | `country`            | _(absent)_                                       | ISO 3166-1 alpha-2 (e.g. `"US"`, `"GB"`) or `"unknown"`          |
| `blobs[10]`  | `user_id`            | _(absent)_                                       | Authenticated `UserId` UUID, or `"anonymous"` if unauthenticated |
| `doubles[0]` | `duration_ms`        | Duration (ms)                                    | (unchanged)                                                      |
| `doubles[1]` | `count`              | Always `1`                                       | (unchanged)                                                      |
| `doubles[2]` | `status_code_number` | HTTP status (numeric)                            | (unchanged)                                                      |
| `doubles[3]` | `request_size_bytes` | Request size (bytes)                             | (unchanged)                                                      |

> `user_id` stores a stable non-PII UUID per the telemetry anti-patterns in `telemetry.md`. Emails, names, and other user-supplied strings must never appear in this field.

## CSP Changes

File: `apps/web/public/_headers`

| Directive     | Current  | Updated                                        |
| ------------- | -------- | ---------------------------------------------- |
| `script-src`  | `'self'` | `'self' https://static.cloudflareinsights.com` |
| `connect-src` | `'self'` | `'self' https://cloudflareinsights.com`        |

All other directives are unchanged.

## Cloudflare Web Analytics Beacon

File: `apps/web/index.html` — add before `</head>`:

```html
<script
  defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "<SITE_TOKEN>"}'
></script>
```

The Site Token is obtained from Cloudflare Dashboard → Web Analytics → Add a site → `pineapple.tylerevans.co`. It is not a secret — it is a public site identifier embedded in the HTML and committed to the repository.

Web Analytics data appears in the Cloudflare Dashboard only. It is not written to any Analytics Engine dataset and is not queryable alongside `pineapple_api_request_events`.

## Edge Cases & Error States

| Scenario                                                | Expected Behavior                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `request.cf.country` absent or empty                    | Write `"unknown"` to `blobs[9]`                                                                |
| Request is unauthenticated (`c.var.user` is undefined)  | Write `"anonymous"` to `blobs[10]`; `blobs[7]` remains `"false"`                               |
| AE write fails                                          | Logged with `console.error` and swallowed per existing failure policy; API response unaffected |
| v1 data already in the dataset                          | Untouched; filter `blob9 = 'v1'` or `blob9 = 'v2'` to segregate by schema version              |
| Web Analytics beacon blocked by ad blocker              | No app error; page view is silently not recorded                                               |
| Cloudflare Web Analytics reporting endpoint unreachable | No app error; beacon silently drops the event                                                  |

## Telemetry

This spec is telemetry infrastructure. It requires the following updates to [telemetry.md](../cross-cutting/telemetry.md):

- Replace the v1 API request data point table with the v2 schema defined above
- Update the Exceptions table: replace `"Frontend — No telemetry — Client-side instrumentation not yet implemented"` with `"Frontend page views — Cloudflare Web Analytics — Anonymous page view data available in the Cloudflare Dashboard; not written to Analytics Engine"`
- Remove the `"No frontend telemetry"` entry from Known Issues

No new domain events. No new operation name mappings.

## Out of Scope

- Frontend click tracking, custom events, or interaction instrumentation beyond page views
- User identity in Cloudflare Web Analytics (anonymous by design)
- Session replay or heatmaps
- City-level geographic granularity (country only)
- Backfilling v1 data points with country or user_id
- A custom analytics dashboard or GraphQL query layer over the AE data
- Request correlation IDs linking API request data points to domain event data points
- Disabling or sampling telemetry in local development

## Open Questions

None — all design decisions resolved in conversation on 2026-06-17.
