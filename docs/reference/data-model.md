# Data Model

> **Audience:** designers & developers · **Purpose:** domain concepts, relationships, and storage details not captured by the API contract · **See also:** [`openapi.json`](openapi.json) for field-level types and validation rules

## Entities at a glance

```
User 1 ──< owns >── * Asset
```

A **User** owns many **Assets**. An asset always belongs to exactly one user,
and a user only ever sees their own assets.

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

| Type      | Backed by   | Notes                        |
| --------- | ----------- | ---------------------------- |
| `UserId`  | UUID string | `.generate()` for new users  |
| `AssetId` | UUID string | `.generate()` for new assets |
| `Email`   | string      | validated email format       |

## Domain events

Aggregates raise events when something significant happens. Today:

| Event          | Raised when         | Carries            |
| -------------- | ------------------- | ------------------ |
| `AssetCreated` | an asset is created | the new asset's id |

There is no event bus yet — events are drained and dropped after persistence.
This is the seam where future side effects (notifications, projections) will
attach.

## Storage mapping

| Domain concept     | D1 table                                     | Notes                                                                  |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| `User`             | `users`                                      |                                                                        |
| `Asset`            | `assets`                                     | `metadata` is a JSON string column                                     |
| Auth (Better Auth) | `user`, `session`, `account`, `verification` | **singular** names; auth infra, separate from the domain `users` table |

Timestamps are stored as ISO-8601 strings. Schema lives in
[`/migrations`](../../migrations) and is applied with
`wrangler d1 migrations apply`.
