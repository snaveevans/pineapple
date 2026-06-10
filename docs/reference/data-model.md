# Data Model

> **Audience:** designers & developers · **Purpose:** domain concepts, relationships, and storage details not captured by the API contract · **See also:** [`openapi.json`](openapi.json) for field-level types and validation rules

## Entities at a glance

```
User 1 ──< owns >── * Asset 1 ──< has >── * MaintenanceRecord
```

A **User** owns many **Assets**. An asset always belongs to exactly one user,
and a user only ever sees their own assets.

An **Asset** has zero or more **Maintenance Records**. Each record belongs to
exactly one asset and inherits access through that asset's owner.

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

## Domain events

Aggregates raise events when something significant happens. Today:

| Event                      | Raised when                     | Carries                                  |
| -------------------------- | ------------------------------- | ---------------------------------------- |
| `AssetCreated`             | an asset is created             | asset, owner, type, and optional year    |
| `MaintenanceRecordCreated` | a maintenance record is created | record, asset, owner, and performed date |

Events are published after persistence through the in-memory event bus.
Infrastructure telemetry handlers consume the implemented events.

## Storage mapping

| Domain concept      | D1 table                                     | Notes                                                                  |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `User`              | `users`                                      |                                                                        |
| `Asset`             | `assets`                                     | `metadata` is a JSON string column                                     |
| `MaintenanceRecord` | `maintenance_records`                        | `performed_at` is a date-only text column                              |
| Auth (Better Auth)  | `user`, `session`, `account`, `verification` | **singular** names; auth infra, separate from the domain `users` table |

Timestamps are stored as ISO-8601 strings. Schema lives in
[`/migrations`](../../migrations) and is applied with
`wrangler d1 migrations apply`.
