# Data Model

> **Audience:** designers & developers · **Purpose:** what data exists, with what
> fields, types, and rules · **Source of truth:** this file, mirroring
> `apps/api/src/domain/` · **Last reviewed:** 2026-05-29

What entities Pineapple stores, the fields on each, and the rules they must
satisfy. Designers: this is the menu of data you can build flows around.
Developers: the field-level contract behind the [API](api.md).

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

A thing the team tracks. The asset has common fields plus a `metadata` object
whose shape depends on its `kind`.

| Field        | Type                | Notes                                   |
| ------------ | ------------------- | --------------------------------------- |
| `id`         | AssetId (UUID)      | Generated on create                     |
| `ownerId`    | UserId              | The owning user; immutable              |
| `name`       | string              | Required, non-blank (trimmed)           |
| `type`       | AssetType enum      | Derived from `metadata.kind`; immutable |
| `metadata`   | AssetMetadata       | Type-specific details (see below)       |
| `archivedAt` | timestamp \| `null` | Set when archived; `null` means active  |
| `createdAt`  | timestamp (ISO)     | Creation time                           |
| `updatedAt`  | timestamp (ISO)     | Last modification time                  |

**AssetType** is one of: `vehicle`, `property`, `equipment`. It mirrors
`metadata.kind` — there is no asset whose `type` disagrees with its metadata.

## Asset metadata (by kind)

`metadata` is a discriminated union on `kind`. Exactly one shape applies per
asset.

### `vehicle`

| Field   | Type        | Required | Rule                                |
| ------- | ----------- | -------- | ----------------------------------- |
| `kind`  | `"vehicle"` | yes      | discriminator                       |
| `make`  | string      | yes      | non-blank (e.g. `"Ram"`)            |
| `model` | string      | yes      | non-blank (e.g. `"2500"`)           |
| `year`  | integer     | yes      | between 1900 and next calendar year |
| `vin`   | string      | no       | exactly 17 characters when present  |

### `property`

| Field      | Type         | Required | Rule                            |
| ---------- | ------------ | -------- | ------------------------------- |
| `kind`     | `"property"` | yes      | discriminator                   |
| `nickname` | string       | no       | free text (e.g. `"Lake cabin"`) |
| `address`  | Address      | yes      | all subfields required          |

**Address:** `street`, `city`, `state`, `postalCode`, `country` — all strings,
all required and non-blank.

### `equipment`

| Field          | Type          | Required | Rule          |
| -------------- | ------------- | -------- | ------------- |
| `kind`         | `"equipment"` | yes      | discriminator |
| `manufacturer` | string        | no       | free text     |
| `modelNumber`  | string        | no       | free text     |
| `serialNumber` | string        | no       | free text     |

> Validation runs in two places (by design — [ADR-0007](../decisions/0007-api-validation-boundary.md)):
> Zod checks shape/types at the HTTP edge (→ 422), and the domain re-checks
> business rules so invariants hold no matter who calls. The rules above are the
> domain rules; the [OpenAPI spec](openapi.json) encodes the same constraints.

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
| `User`             | `users`                                      | `metadata` stored as JSON text on assets                               |
| `Asset`            | `assets`                                     | `metadata` is a JSON string column                                     |
| Auth (Better Auth) | `user`, `session`, `account`, `verification` | **singular** names; auth infra, separate from the domain `users` table |

Timestamps are stored as ISO-8601 strings. Schema lives in
[`/migrations`](../../migrations) and is applied with
`wrangler d1 migrations apply`.
