# Data Model

> **Audience:** designers & developers · **Purpose:** domain concepts, relationships, and storage details not captured by the API contract · **See also:** [`openapi.json`](openapi.json) for field-level types and validation rules

## Entities at a glance

```
User 1 ──< owns >── * Asset 1 ──< has >── * MaintenanceRecord
                   └──< appears in >── * ActivityEntry
```

A **User** owns many **Assets**. An asset always belongs to exactly one user,
and a user only ever sees their own assets.

An **Asset** has zero or more **Maintenance Records**. Each record belongs to
exactly one asset and inherits access through that asset's owner.

An **Activity Entry** is an append-only projection of a tracked domain event.
It belongs to the same owner as the source action and stores the asset snapshot
needed to render history without reading the source asset, task, or record back.

## User

The identity of a person using Pineapple.

| Field       | Type            | Notes                                  |
| ----------- | --------------- | -------------------------------------- |
| `id`        | UserId (UUID)   | Stable identifier, generated on create |
| `email`     | Email           | Unique; how sign-in maps to a user     |
| `createdAt` | timestamp (ISO) | When the user first signed in          |

Users are **provisioned automatically** on first Google sign-in — there is no
separate registration. Identity (login, sessions) is managed by Better Auth in
its own tables; this `User` is the domain-facing record keyed by email. See
[the auth model](../../CLAUDE.md#auth-model).

## Asset

Field shapes and validation rules live in the [OpenAPI spec](openapi.json)
(`Asset`, `AssetMetadata`, `VehicleMetadata`, `PropertyMetadata`,
`EquipmentMetadata`, `Address`). Domain-only details:

- **`ownerId`** — the owning `UserId`; set on creation and immutable. Not
  exposed in the API response.
- **`type`** mirrors `metadata.kind` — there is no asset whose `type`
  disagrees with its metadata. Both are immutable after creation.

## Value objects

These are **branded** types, not raw strings — constructed via `.from()` /
`.generate()` and validated on creation (see
[ADR-0002](../decisions/0002-use-tactical-ddd-patterns-for-the-domain-layer.md)).

| Type                  | Backed by   | Notes                         |
| --------------------- | ----------- | ----------------------------- |
| `UserId`              | UUID string | `.generate()` for new users   |
| `AssetId`             | UUID string | `.generate()` for new assets  |
| `ActivityEntryId`     | UUID string | stable id for history entries |
| `MaintenanceRecordId` | UUID string | `.generate()` for new records |
| `Email`               | string      | validated email format        |

## Maintenance Record

The public shape and validation rules live in the [OpenAPI spec](openapi.json)
(`MaintenanceRecord`, `CreateMaintenanceRecordBody`). Domain-only details:

- **`ownerId`** is copied from the target asset at creation and is not exposed
  in API responses.
- **`performedAt`** is stored as a timezone-free `YYYY-MM-DD` calendar date.
  It is never converted to a timestamp for persistence or display.
- Archived assets retain readable history but cannot receive new records.

## Activity Entry

The public shape and validation rules live in the [OpenAPI spec](openapi.json)
(`ActivityResponse`, `ActivityEntry`, `ActivityAvailableFilters`). Domain-only
details:

- **`ownerId`** scopes the entry to the owning user and is never exposed in API
  responses.
- **`actorId`** is stored separately from `ownerId` for future delegation/team
  attribution. In v1 they are the same user and the API does not display actor
  copy.
- **Asset snapshots** (`asset_id`, `asset_name`, `asset_type`) are copied from
  the enriched event payload. Entries remain readable after an asset is renamed,
  archived, or after a task is deleted.
- **`source_event_id`** is unique. The queue consumer inserts entries
  idempotently from this id so at-least-once delivery cannot duplicate history.
- Entries are immutable and append-only. There is no edit/delete history path.

## Domain events

Aggregates raise events when something significant happens. Today:

| Event                      | Raised when                     | Carries                                                                                       |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `AssetCreated`             | an asset is created             | event id, asset/owner/actor, asset snapshot, type, and optional year                          |
| `MaintenanceRecordCreated` | a maintenance record is created | event id, record/asset/owner/actor, asset snapshot, title, performed date, and linked task id |
| `MaintenanceTaskCreated`   | a maintenance task is scheduled | event id, task/asset/owner/actor, asset snapshot, title, interval                             |
| `MaintenanceTaskAdvanced`  | a task is completed by a record | event id, task/record/asset/owner/actor, asset snapshot, title, performed date                |
| `MaintenanceTaskDeleted`   | a maintenance task is removed   | event id, task/asset/owner/actor, asset snapshot, title                                       |

Events are published after persistence through the in-memory event bus for
telemetry. Tracked activity events are also written to an outbox in the same D1
batch as the domain change and then delivered to the activity-history queue.
Telemetry handlers ignore the user-supplied snapshot/title fields so PII does
not enter Analytics Engine.

## Storage mapping

| Domain concept      | D1 table                                     | Notes                                                                  |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `User`              | `users`                                      |                                                                        |
| `Asset`             | `assets`                                     | `metadata` is a JSON string column                                     |
| `MaintenanceRecord` | `maintenance_records`                        | `performed_at` is a date-only text column                              |
| `ActivityEntry`     | `activity_entries`                           | append-only history projection, ordered by `occurred_at` then `id`     |
| Activity outbox     | `activity_event_outbox`                      | producer-side transactional outbox for the activity-history queue      |
| Queue dead letters  | `dead_letters`                               | durable copy of malformed or exhausted activity queue messages         |
| Auth (Better Auth)  | `user`, `session`, `account`, `verification` | **singular** names; auth infra, separate from the domain `users` table |

Timestamps are stored as ISO-8601 strings. Schema lives in
[`/migrations`](../../migrations) and is applied with
`wrangler d1 migrations apply`.
