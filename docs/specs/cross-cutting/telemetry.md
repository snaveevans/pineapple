---
audience: all contributors
purpose: canonical telemetry architecture and data contract for feature specs
source: this file
date: 2026-06-02
---

# Telemetry — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features that add API endpoints or domain events

---

## Summary

Telemetry is split into two independent systems: request-level telemetry (every HTTP request, captured in middleware) and domain-event telemetry (business events, captured in event handlers). Both write to Cloudflare Analytics Engine. Telemetry failures are never blocking — they are logged and swallowed so an Analytics Engine outage cannot break the API.

## Canonical Behavior

### Two Systems

| System       | Dataset                         | Trigger                             | Capture point                        |
| ------------ | ------------------------------- | ----------------------------------- | ------------------------------------ |
| API Request  | `pineapple_api_request_events`  | Every HTTP request                  | `createTechnicalTelemetryMiddleware` |
| Domain Event | `pineapple_asset_domain_events` | Domain event published to event bus | Per-event telemetry handler          |

The two systems are complementary, not interchangeable. API request telemetry answers operational questions (latency, error rates, traffic). Domain event telemetry answers business questions (what entities were created, by whom, with what attributes).

### Data Shape

Both systems write to Cloudflare Analytics Engine using the same envelope:

```ts
{
  indexes: string[]   // partition/lookup key — one value
  blobs:   string[]   // categorical dimensions
  doubles: number[]   // numeric measurements
}
```

**API Request data point** (index: `operation`):

| Field        | Name                 | Value                                                                                          |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------------- |
| `indexes[0]` | —                    | Operation name (e.g. `"CreateAsset"`)                                                          |
| `blobs[0]`   | `operation`          | Operation name                                                                                 |
| `blobs[1]`   | `route_pattern`      | Route pattern (e.g. `"/api/assets/{id}"`)                                                      |
| `blobs[2]`   | `method`             | HTTP method (`"GET"`, `"POST"`, …)                                                             |
| `blobs[3]`   | `status_class`       | `"2xx"`, `"4xx"`, `"5xx"`                                                                      |
| `blobs[4]`   | `status_code`        | HTTP status code as string                                                                     |
| `blobs[5]`   | `outcome`            | `"success"`, `"failure"`, `"error"`                                                            |
| `blobs[6]`   | `error_name`         | Error constructor name, `"unknown"` for non-`Error` values, or `"none"` when no error occurred |
| `blobs[7]`   | `authenticated`      | `"true"` or `"false"`                                                                          |
| `blobs[8]`   | `schema_version`     | `"v1"`                                                                                         |
| `doubles[0]` | `duration_ms`        | Duration (ms)                                                                                  |
| `doubles[1]` | `count`              | Always `1`                                                                                     |
| `doubles[2]` | `status_code_number` | HTTP status code (numeric)                                                                     |
| `doubles[3]` | `request_size_bytes` | Request size (bytes)                                                                           |

> Analytics Engine SQL references blobs and doubles as 1-indexed (`blob1` = `blobs[0]`, `double1` = `doubles[0]`).

**Domain event data point — `AssetCreated`** (dataset: `pineapple_asset_domain_events`, index: `owner_id`):

| Field        | Name               | Value                                                                          |
| ------------ | ------------------ | ------------------------------------------------------------------------------ |
| `indexes[0]` | —                  | `owner_id` (partition key for per-owner queries)                               |
| `blobs[0]`   | `event_type`       | `"AssetCreated"`                                                               |
| `blobs[1]`   | `aggregate_type`   | `"Asset"`                                                                      |
| `blobs[2]`   | `asset_id`         | Asset UUID                                                                     |
| `blobs[3]`   | `owner_id`         | Owner UUID                                                                     |
| `blobs[4]`   | `asset_type`       | `"vehicle"`, `"property"`, `"equipment"`                                       |
| `blobs[5]`   | `actor_id`         | UUID of the user who performed the action — currently always equals `owner_id` |
| `blobs[6]`   | `source_use_case`  | `"CreateAsset"`                                                                |
| `blobs[7]`   | `schema_version`   | `"v1"`                                                                         |
| `blobs[8]`   | `result`           | `"success"`                                                                    |
| `doubles[0]` | `count`            | Always `1`                                                                     |
| `doubles[1]` | `event_time_ms`    | Event timestamp (ms since epoch)                                               |
| `doubles[2]` | `asset_model_year` | Model year for vehicles; `0` for other asset types                             |

**Domain event data point — `MaintenanceRecordCreated`** (dataset: `pineapple_maintenance_domain_events`, index: `owner_id`):

| Field        | Name                    | Value                                                   |
| ------------ | ----------------------- | ------------------------------------------------------- |
| `indexes[0]` | —                       | `owner_id` (partition key for per-owner queries)        |
| `blobs[0]`   | `event_type`            | `"MaintenanceRecordCreated"`                            |
| `blobs[1]`   | `aggregate_type`        | `"MaintenanceRecord"`                                   |
| `blobs[2]`   | `maintenance_record_id` | Maintenance record UUID                                 |
| `blobs[3]`   | `asset_id`              | Asset UUID                                              |
| `blobs[4]`   | `owner_id`              | Owner UUID                                              |
| `blobs[5]`   | `actor_id`              | UUID of the authenticated user who performed the action |
| `blobs[6]`   | `source_use_case`       | `"CreateMaintenanceRecord"`                             |
| `blobs[7]`   | `schema_version`        | `"v1"`                                                  |
| `blobs[8]`   | `result`                | `"success"`                                             |
| `doubles[0]` | `count`                 | Always `1`                                              |
| `doubles[1]` | `event_time_ms`         | Event timestamp (ms since epoch)                        |
| `doubles[2]` | `performed_date_ms`     | Performed date at UTC midnight (ms since epoch)         |

### Analytics Engine Constraints

These limits apply to every data point written and must be respected when designing new event schemas:

- Max 20 blobs, 20 doubles, and 1 index per `writeDataPoint` call
- Total blob payload per data point must be under 16 KB
- Index field must be 96 bytes or less
- A single Worker invocation may write at most 250 data points
- Data retention is 3 months — Analytics Engine is not an audit log, replay log, or long-term event store
- SQL queries must account for `_sample_interval` when aggregating (e.g. `SUM(_sample_interval * double1)`)
- SQL blob/double references are 1-indexed (`blob1` = `blobs[0]`, `double1` = `doubles[0]`)

### Planned Datasets

| Dataset                               | Binding                        | Purpose                                 |
| ------------------------------------- | ------------------------------ | --------------------------------------- |
| `pineapple_asset_domain_events`       | `ASSET_DOMAIN_TELEMETRY`       | Asset lifecycle events — implemented    |
| `pineapple_api_request_events`        | `API_REQUEST_TELEMETRY`        | HTTP request telemetry — implemented    |
| `pineapple_user_domain_events`        | `USER_DOMAIN_TELEMETRY`        | User lifecycle events — planned         |
| `pineapple_maintenance_domain_events` | `MAINTENANCE_DOMAIN_TELEMETRY` | Maintenance record events — implemented |

### Operation Name Mapping

Every API route maps to a named operation used as the `indexes[0]` value in request telemetry. The current mapping:

| Route                                            | Operation                 |
| ------------------------------------------------ | ------------------------- |
| `POST /api/auth/sign-in/social`                  | `SignIn`                  |
| `GET /api/auth/callback/google`                  | `OAuthCallback`           |
| `GET /api/auth/get-session`                      | `SessionCheck`            |
| `POST /api/auth/sign-out`                        | `SignOut`                 |
| `/api/auth/*` (other)                            | `Auth`                    |
| `POST /api/assets`                               | `CreateAsset`             |
| `GET /api/assets`                                | `ListAssets`              |
| `GET /api/assets/{id}`                           | `GetAsset`                |
| `GET /api/users/me`                              | `GetUserProfile`          |
| `PATCH /api/users/me`                            | `UpdateUserProfile`       |
| `POST /api/assets/{assetId}/maintenance-records` | `CreateMaintenanceRecord` |
| `GET /api/assets/{assetId}/maintenance-records`  | `ListMaintenanceRecords`  |
| `GET /health`                                    | `Health`                  |
| `GET /openapi.json`                              | `OpenApiDocument`         |
| `GET /reference`                                 | `ApiReference`            |
| (anything else)                                  | `Unknown`                 |

### Failure Policy

Telemetry failures are non-blocking at every layer:

1. `AnalyticsEngineTelemetrySink.write()` wraps `dataset.writeDataPoint()` in try-catch — errors are logged with `console.error` and swallowed.
2. The request telemetry middleware wraps the sink call in a second try-catch for the same reason.
3. The `InMemoryEventBus` catches handler errors (including domain telemetry handlers) per-handler and logs them without re-throwing.

A complete Analytics Engine outage will produce `console.error` log entries but will not affect API responses.

## Feature Integration Contract

**Adding a new API endpoint:**

- Add an entry to the operation name mapping in the request telemetry middleware.
- For use-case-backed routes, the operation name must match the use case name (e.g. `UpdateAsset`, `ArchiveAsset`). For system routes with no use case (health checks, API docs), use a descriptive label as shown in the Operation Name Mapping table.
- The spec for the feature must name the operation it maps to.

**Adding a new domain event:**

- Create a telemetry handler for the event (following `AssetCreatedTelemetryHandler` as the pattern).
- Register the handler in `registerDomainTelemetry()`.
- The spec for the feature must define the full ordered `blobs` and `doubles` contract for the event — every position, its name, and its value. Use the `AssetCreated` table above as the model. Future events (e.g. `MaintenanceRecorded`) may use multiple domain-specific doubles; document each one explicitly.

## Exceptions

| Feature                                | Deviation                 | Reason                                                                           |
| -------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Frontend                               | No telemetry              | Client-side instrumentation not yet implemented                                  |
| Read operations (GetAsset, ListAssets) | No domain event telemetry | Reads do not produce domain events; request telemetry provides sufficient signal |

## Anti-Patterns

- **Throwing on telemetry failure:** Telemetry must never break a request. All sink calls must be wrapped so errors are swallowed after logging.
- **Adding an endpoint without an operation name:** Routes that fall through to `"Unknown"` are invisible in telemetry. Every new route needs an entry in the mapping before it ships.
- **Storing PII in blobs:** Blobs are retained and queryable. Never store user-supplied strings (names, addresses, emails, VINs, serial numbers, raw request bodies) in telemetry fields. For user and entity identifiers use stable non-PII IDs (UUIDs); categorical enum values (operation names, asset types, status codes, schema versions) are fine.
- **Telemetry in the domain or application layer:** Telemetry handlers live in `infrastructure/telemetry/`. The domain publishes events; infrastructure decides what to record. Never import Analytics Engine bindings, sinks, or Hono from `domain/` or `application/`.
- **Re-querying D1 inside a telemetry handler:** If a field is needed in telemetry, it must be part of the domain event payload. Handlers must not make additional database calls.
- **Using Analytics Engine as an audit log or event store:** Retention is 3 months, writes are sampled, and exact replay is not supported. Use D1, R2, or Logpush for exact records.
- **Using asset IDs or random UUIDs as the index:** The index is the query partition key. Use `owner_id` for domain events and `operation` for request telemetry, not high-cardinality random IDs.

## Known Issues

- **`actor_id` (`blobs[5]`) always equals `owner_id` (`blobs[3]`) today.** `actor_id` records who performed the action, which is semantically distinct from who owns the entity. In a system where only the owner can act, the two are the same. When delegation or assignment is introduced — where one user acts on another's behalf — `actor_id` will diverge from `owner_id`. The field is intentionally reserved for this future case.
- **No request correlation across the two systems.** A domain event data point cannot be linked to the API request that produced it — there is no trace ID or correlation ID shared between them. **Planned:** generate a request-scoped correlation ID in the telemetry middleware, thread it through to domain events via the use case, and include it in both data points.
- **No frontend telemetry.** User-facing errors and interactions are invisible unless they produce an API call that fails. **Planned:** define what frontend events are worth capturing before implementing, to avoid instrumenting noise.
- **Telemetry is always active in all environments.** There is no reduced or disabled telemetry mode for local development — `wrangler dev` writes to Miniflare's Analytics Engine emulation at the same 100% sample rate as production. This is acceptable now but should be revisited if local test runs begin polluting a shared dev dataset.
