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

| Field                         | Type                    | Notes                                                                        |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `id`                          | UserId (UUID)           | Stable identifier, generated on create                                       |
| `email`                       | Email                   | Provider auth email; unique; how sign-in maps to a user; read-only in domain |
| `name`                        | string \| null          | User-confirmed display name; null until onboarding sets it                   |
| `onboardingCompletedAt`       | timestamp (ISO) \| null | Set once when the user first confirms their profile                          |
| `notificationEmail`           | Email \| null           | User-controlled contact address; stored normalized; distinct from auth email |
| `notificationEmailVerifiedAt` | timestamp (ISO) \| null | When the contact email was verified; null means unverified/unset             |
| `createdAt`                   | timestamp (ISO)         | When the user first signed in                                                |

Users are **provisioned automatically** on first Google sign-in — there is no
separate registration. Identity (login, sessions) is managed by Better Auth in
its own tables; this `User` is the domain-facing record keyed by email. See
[the auth model](../../CLAUDE.md#auth-model).

The **contact / notification email** (`notificationEmail`) is user-controlled and
separate from the provider auth `email`. It is the address reminders may be sent
to and is stored normalized (lowercased/trimmed via the `Email` value object) so
it matches the auto-verify comparison and dedupes reliably. Reminder emails are
only ever delivered to a **verified** contact email
(`notificationEmailVerifiedAt` is non-null). The API exposes the derived
`notificationEmailVerified` boolean rather than the timestamp.

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

| Type                  | Backed by   | Notes                            |
| --------------------- | ----------- | -------------------------------- |
| `UserId`              | UUID string | `.generate()` for new users      |
| `AssetId`             | UUID string | `.generate()` for new assets     |
| `TeamId`              | UUID string | `.generate()` for new teams      |
| `ActivityEntryId`     | UUID string | stable id for history entries    |
| `MaintenanceRecordId` | UUID string | `.generate()` for new records    |
| `Email`               | string      | validated email format           |
| `VerificationTokenId` | UUID string | id for a verification token      |
| `NotificationId`      | UUID string | id for an inbox notification     |
| `ScheduledReminderId` | UUID string | id for a scheduled reminder      |
| `EmailBatchId`        | UUID string | id for an aggregated email batch |

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

## Team

An opt-in sharing scope on top of user-owned assets (see
[ADR-0015](../decisions/0015-teams-as-opt-in-sharing-scope.md)). A user belongs
to at most one team; creating a team makes the caller its owner and sole member.

Field shapes and validation rules live in the [OpenAPI spec](openapi.json)
(`Team`, `TeamMember`, `CreateTeamBody`, `MyTeam`). Domain-only details:

- **`ownerId`** — the `UserId` of the team's creator/owner. Exposed in the API
  response (unlike assets).
- **`role`** — `"owner"` for the creator; `"member"` for future invitees
  (invitations are a separate spec). Until the invitations spec lands, every team
  has exactly one member with role `owner`.
- A unique index on `team_members.user_id` enforces the one-team-per-user rule at
  the storage level, in addition to the application-level 409 check.

## Domain events

Aggregates raise events when something significant happens. Today:

| Event                        | Raised when                                       | Carries                                                                                                                                             |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AssetCreated`               | an asset is created                               | event id, asset/owner/actor, asset snapshot, type, optional year, and History `activityEntryType` conclusion                                        |
| `MaintenanceRecordCreated`   | a maintenance record is created                   | event id, record/asset/owner/actor, asset snapshot, title, performed date, linked task id, and History `activityEntryType` conclusion               |
| `MaintenanceTaskCreated`     | a maintenance task is scheduled                   | event id, task/asset/owner/actor, asset snapshot, title, interval, resulting **`nextDue`**, and History `activityEntryType` conclusion              |
| `MaintenanceTaskAdvanced`    | a task is completed by a record                   | event id, task/record/asset/owner/actor, asset snapshot, title, performed date, resulting **`nextDue`**, and History `activityEntryType` conclusion |
| `MaintenanceTaskDeleted`     | a maintenance task is removed                     | event id, task/asset/owner/actor, asset snapshot, title, and History `activityEntryType` conclusion                                                 |
| `NotificationEmailUpdated`   | a user sets/changes their contact email           | event id and `userId` only (no address — PII stays out of the event)                                                                                |
| `NotificationEmailVerified`  | a user's contact email becomes verified           | event id and `userId` only (no address)                                                                                                             |
| `NotificationEmailRemoved`   | a user clears their contact email                 | event id and `userId` only (no address)                                                                                                             |
| `MaintenanceReminderCreated` | a due-soon reminder is created                    | event id, notification/task/asset/owner ids, notification type, system actor, and lead-days conclusion                                              |
| `ReminderEmailDispatched`    | an aggregated reminder email decision is recorded | event id, email batch id, owner id, result, suppress reason, and covered notification count; no email address or reminder copy                      |
| `TeamCreated`                | a team is created                                 | event id, team/owner/actor, and team name                                                                                                           |

Events are published after persistence through the in-memory event bus for
telemetry. Tracked activity events are also written to an outbox in the same D1
batch as the domain change and then delivered to the activity-history queue.
Telemetry handlers ignore the user-supplied snapshot/title fields so PII does
not enter Analytics Engine.

## Email verification

Proving that a user-entered **contact email** ([User](#user)) belongs to the
user, before anything else is sent to it. This is a separate capability from
Better Auth's provider-verified auth email and uses its own tables — never
Better Auth's singular `verification` table.

- **Tokens** (`email_verification_tokens`) are scoped by `(user_id, email,
purpose)`. In v1 the only `purpose` is `notification_email`. The raw token is
  **never stored** — only a hash (`token_hash`); a presented token is matched by
  hashing it. Each token has a 24-hour TTL (`expires_at`) and is single-use:
  `consumed_at` is stamped both when a token is confirmed and when it is
  superseded (a newer send, or the user changing/removing the address).
- **Send records** (`email_verification_sends`) are an audit trail and the
  backing store for the anti-abuse rate limits: a 60-second per-address
  cooldown, 5 sends per address per rolling 24h (counted across all users so a
  targeted inbox is protected), and 10 sends per user per rolling 24h.

## Notifications

The durable-scheduler consumer (ADR-0010). It keeps its **own** cancelable state
from enriched `MaintenanceTask*` events and never reads the maintenance-task
tables in steady state; each row carries a self-contained asset/task snapshot so
it renders even after the source task is deleted or the asset archived.

- **`scheduled_reminders`** — one cancelable reminder per `(task, cycle)`, keyed
  by source `maintenance_task_id`, with `status` (`pending` / `fired` /
  `canceled` / `superseded`), the `next_due` snapshot, the derived `fire_at`
  (`next_due − 7-day lead`, date-only), and `last_event_id` /
  `last_event_occurred_at` for dedupe and order resolution. A partial unique
  index enforces at most one `pending` reminder per task, and a task-cycle
  unique index makes the one-time launch bootstrap idempotent on
  `(maintenance_task_id, next_due)`.
- **`notifications`** — the durable in-app inbox. One row per `(task, cycle)`
  (unique on `maintenance_task_id, next_due`), owner-scoped, newest-first with an
  `id` tiebreak, `read_at` nullable. Snapshots (`asset_*`, `task_title`,
  `next_due`) copied from the reminder so the row is self-contained. When a
  notification is created by the sweep, nullable `email_batch_id` links it to
  the owner/sweep email aggregate. `ownerId` and `actorId` are never exposed in
  API responses; `actorId` is `"system"` and reserved for future delegation.
- **`email_batches`** — one aggregated reminder email per owner per sweep, with
  `status` (`pending` / `sent` / `suppressed` / `failed`), `suppress_reason`, and
  the covered `notification_count`. The outbound consumer is idempotent on the
  batch id.
- **`notification_email_outbox`** — producer-side transactional outbox for
  reminder email jobs. The sweep writes this in the same D1 batch as
  `notifications`, fired reminder status updates, and `email_batches`; a later
  queue relay moves pending rows to the outbound reminder-email queue.
- **`notification_ingested_events`** — dedupe/order markers keyed by source
  `event_id`, so at-least-once redelivery of a `MaintenanceTask*` event is a
  no-op.
- **`notification_dead_letters`** — durable copies of messages exhausted on the
  notification queues / DLQs, so a permanently failing job is persisted, not
  dropped.

## Storage mapping

| Domain concept        | D1 table                                     | Notes                                                                  |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `User`                | `users`                                      |                                                                        |
| `Asset`               | `assets`                                     | `metadata` is a JSON string column                                     |
| `Team`                | `teams` + `team_members`                     | unique index on `team_members.user_id` enforces one team per user      |
| `MaintenanceRecord`   | `maintenance_records`                        | `performed_at` is a date-only text column                              |
| `ActivityEntry`       | `activity_entries`                           | append-only history projection, ordered by `occurred_at` then `id`     |
| Activity outbox       | `activity_event_outbox`                      | producer-side transactional outbox for the activity-history queue      |
| Verification tokens   | `email_verification_tokens`                  | hashed, single-use, 24h TTL, scoped by `(user, email, purpose)`        |
| Verification sends    | `email_verification_sends`                   | per-send audit rows backing the cooldown / per-address / per-user caps |
| Scheduled reminders   | `scheduled_reminders`                        | notifications' own cancelable schedule, keyed by source task           |
| Notifications         | `notifications`                              | durable in-app inbox; one per `(task, cycle)`                          |
| Email batches         | `email_batches`                              | one aggregated reminder email per owner per sweep                      |
| Reminder email outbox | `notification_email_outbox`                  | producer-side transactional outbox for aggregated reminder email jobs  |
| Notification events   | `notification_ingested_events`               | inbound event dedupe/order markers                                     |
| Notification DLQ      | `notification_dead_letters`                  | durable copy of exhausted notification-queue messages                  |
| Queue dead letters    | `dead_letters`                               | durable copy of malformed or exhausted activity queue messages         |
| Auth (Better Auth)    | `user`, `session`, `account`, `verification` | **singular** names; auth infra, separate from the domain `users` table |

Timestamps are stored as ISO-8601 strings. Schema lives in
[`/migrations`](../../migrations) and is applied with
`wrangler d1 migrations apply`.
