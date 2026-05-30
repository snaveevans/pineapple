# Domain Telemetry Plan

## 1. Summary

Pineapple records two telemetry streams: domain telemetry derived from domain
events, and technical telemetry derived from HTTP/runtime behavior. Domain
telemetry answers business questions such as how many assets were created by
type, while technical telemetry answers operational questions such as p95
latency for `CreateAsset`. The domain layer remains pure: aggregates raise
business events, application use cases publish them after persistence, and
infrastructure subscribers translate them into telemetry writes. Cloudflare
Workers Analytics Engine is the primary custom telemetry sink because it is a
Worker-native high-cardinality time-series store with non-blocking writes and
SQL queries.

References: [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/),
[Get started](https://developers.cloudflare.com/analytics/analytics-engine/get-started/),
[limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/),
[sampling](https://developers.cloudflare.com/analytics/analytics-engine/sampling/),
and [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

## 2. Architecture Decision

Telemetry belongs outside `domain/`. Domain events carry business facts needed
by downstream consumers; for example, `AssetCreated` carries `assetId`,
`ownerId`, `assetType`, optional `assetModelYear`, and `occurredAt`, not
Analytics Engine field positions.

The application layer owns the `EventBus` and `DomainEventHandler` ports. Use
cases save aggregates, pull events, and publish them after successful
persistence. They do not know whether a subscriber writes telemetry,
notifications, projections, or nothing.

Cloudflare-specific telemetry lives in `infrastructure/telemetry/`. That layer
contains Analytics Engine sinks, domain event subscribers, mappers, and safe
write wrappers. `worker.ts` is the composition root that binds Analytics Engine
datasets to subscribers.

Technical telemetry is API/runtime instrumentation. It lives as injectable Hono
middleware in `api/middleware/technicalTelemetry.ts` and depends only on a sink
shape. `worker.ts` supplies the Analytics Engine implementation.

## 3. Analytics Engine Schema Per Event Type

Use separate datasets for domain and technical telemetry so ordered Analytics
Engine fields keep stable meanings.

### `pineapple_asset_domain_events`

Binding: `ASSET_DOMAIN_TELEMETRY`  
Index: `owner_id`

| Event          | Blobs                                                                                                                           | Doubles                                      | Answers                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| `AssetCreated` | `event_type`, `aggregate_type`, `asset_id`, `owner_id`, `asset_type`, `actor_id`, `source_use_case`, `schema_version`, `result` | `count`, `event_time_ms`, `asset_model_year` | Asset creation counts by week/type/owner |

Example question: "How many assets were created this week by type?"

```sql
SELECT
  blob5 AS asset_type,
  SUM(_sample_interval * double1) AS assets_created
FROM pineapple_asset_domain_events
WHERE blob1 = 'AssetCreated'
  AND timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY asset_type
ORDER BY assets_created DESC
```

### Future `pineapple_maintenance_domain_events`

Binding: `MAINTENANCE_DOMAIN_TELEMETRY`  
Index: `owner_id`

| Event                 | Blobs                                                                                                                                              | Doubles                                                                         | Answers                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `MaintenanceRecorded` | `event_type`, `aggregate_type`, `maintenance_id`, `owner_id`, `asset_id`, `asset_type`, `maintenance_type`, `actor_id`, `schema_version`, `result` | `count`, `event_time_ms`, `cost_cents`, `downtime_minutes`, `odometer_or_hours` | Maintenance volume/cost/downtime by asset/type/category |

### `pineapple_api_request_events`

Binding: `API_REQUEST_TELEMETRY`  
Index: `operation`

| Event       | Blobs                                                                                                                             | Doubles                                                            | Answers                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| API request | `operation`, `route_pattern`, `method`, `status_class`, `status_code`, `outcome`, `error_name`, `authenticated`, `schema_version` | `duration_ms`, `count`, `status_code_number`, `request_size_bytes` | Request volume, error rates, p95 latency by route/use case |

Example question: "What is the p95 latency of `CreateAsset`?"

```sql
SELECT quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_ms
FROM pineapple_api_request_events
WHERE blob1 = 'CreateAsset'
  AND timestamp >= NOW() - INTERVAL '1' DAY
```

Analytics Engine constraints to preserve in future schemas:

- Up to 20 blobs, 20 doubles, and one index per `writeDataPoint`.
- Total blob payload per data point must remain under 16 KB.
- The index must be 96 bytes or less.
- A Worker invocation can write at most 250 data points.
- Query counts, sums, averages, and quantiles must account for
  `_sample_interval`.
- Retention is three months; use D1 outbox, R2, Logpush, or an external
  observability stack for exact replay or longer retention.

## 4. Extensibility Pattern With A Concrete Template

Naming conventions:

- Domain event files: `domain/<aggregate>/events/<PastTenseEvent>.ts`
- Telemetry handlers:
  `infrastructure/telemetry/<aggregate>/<EventName>TelemetryHandler.ts`
- Dataset bindings: `<AGGREGATE>_DOMAIN_TELEMETRY`
- Dataset names: `pineapple_<aggregate>_domain_events`
- Event type strings: exact event name, for example `AssetCreated`

Checklist for a new feature:

1. Add or update the domain event with business dimensions needed by
   non-domain consumers.
2. Publish pulled events from the use case after persistence through
   `EventBus`.
3. Add a telemetry mapper and handler under
   `infrastructure/telemetry/<aggregate>/`.
4. Register the handler in `registerDomainTelemetry(...)` from `worker.ts`.
5. Add mapper tests proving the ordered blobs/doubles match this document.
6. Update this document with the new event row.

Template:

```ts
export class AssetCreatedTelemetryHandler implements DomainEventHandler<AssetCreated> {
  readonly eventType = "AssetCreated" as const;

  constructor(private readonly sink: TelemetrySink) {}

  handle(event: AssetCreated): void {
    this.sink.write({
      indexes: [event.ownerId],
      blobs: [
        event.type,
        "Asset",
        event.assetId,
        event.ownerId,
        event.assetType,
        event.ownerId,
        "CreateAsset",
        "v1",
        "success",
      ],
      doubles: [1, event.occurredAt.getTime(), event.assetModelYear ?? 0],
    });
  }
}
```

Sinks and the in-memory bus must isolate failures. Telemetry write failures are
logged but never thrown back into the use case.

## 5. Technical Telemetry Approach

`createTechnicalTelemetryMiddleware` wraps the Worker routes and emits one
Analytics Engine data point per request. It captures normalized route pattern,
operation, method, final status, status class, success/failure/error outcome,
error class, authenticated state when available, request size, and duration via
`performance.now()`.

Route normalization:

| Request               | Operation     | Route pattern      |
| --------------------- | ------------- | ------------------ |
| `POST /api/assets`    | `CreateAsset` | `/api/assets`      |
| `GET /api/assets`     | `ListAssets`  | `/api/assets`      |
| `GET /api/assets/:id` | `GetAsset`    | `/api/assets/{id}` |
| `/api/auth/*`         | `Auth`        | `/api/auth/*`      |
| unknown               | `Unknown`     | `Unknown`          |

Workers Logs are enabled with `[observability] enabled = true` for invocation
logs, uncaught exceptions, CPU time, wall time, and debugging. Analytics Engine
is for custom aggregate queries; Workers Logs, Logpush, R2, or an external
observability stack should be used for troubleshooting and longer forensic
workflows.

## 6. Anti-Patterns To Avoid

- Do not import Cloudflare bindings, Hono, Analytics Engine, or telemetry sinks
  from `domain/` or application use cases.
- Do not create business telemetry directly from HTTP payloads when it should
  come from domain events.
- Do not re-query D1 inside telemetry handlers to recover fields that should be
  part of the event payload.
- Do not await Analytics Engine writes in the request path or let telemetry
  failures fail a use case.
- Do not use request IDs, asset IDs, or random UUIDs as Analytics Engine indexes
  by default; index by the stable query partition, usually `ownerId` for domain
  events and `operation` for request telemetry.
- Do not put PII or sensitive operational details in blobs: emails, asset names,
  addresses, VINs, serial numbers, secrets, cookies, or raw request bodies.
- Do not use Analytics Engine as an audit log, replay log, exact billing ledger,
  or long-term event store.

## 7. Implementation Order

1. Add the `EventBus` application port, in-memory infrastructure bus, and safe
   handler registration.
2. Update `AssetCreated` to include asset telemetry dimensions and publish it
   from `CreateAsset` after `D1AssetRepository.save`.
3. Add `ASSET_DOMAIN_TELEMETRY` and `API_REQUEST_TELEMETRY` bindings in
   `apps/api/wrangler.toml`.
4. Add Analytics Engine sink wrappers and the `AssetCreatedTelemetryHandler`.
5. Add technical telemetry middleware and wire it in `worker.ts`.
6. Add tests for event publication, telemetry mapping, handler failure
   isolation, and middleware data point construction.
7. Run `pnpm lint`, `pnpm type-check`, and `pnpm -r test`.
