# Data Model

> **Audience:** designers & developers · **Purpose:** domain concepts, relationships, and storage details not captured by the API contract · **See also:** [`openapi.json`](openapi.json) for field-level types and validation rules

## Entities at a glance

```
User 1 ──< owns >── * Asset 1 ──< has >── * MaintenanceRecord
                   └──< appears in >── * ActivityEntry
```

A **User** owns many **Assets**. An asset always belongs to exactly one user.
Assets may be **shared** to a team the owner belongs to; team members can then
see and edit those assets. Unshared assets remain personal.

An **Asset** has zero or more **Maintenance Records**. Each record belongs to
exactly one asset and inherits access through that asset (ownership or team
sharing).

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
- **`sharedTeamId`** — optional `TeamId`; null means personal. Set only by the
  asset owner via share/unshare. Not exposed raw in the API; clients receive a
  computed `sharing` descriptor instead.
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
- **`revision`** is an internal optimistic-concurrency counter initialized to `0` and incremented
  by each successful correction; it is not exposed in API responses.
- **`performedAt`** is stored as a timezone-free `YYYY-MM-DD` calendar date.
  It is never converted to a timestamp for persistence or display.
- Archived assets retain readable history but cannot receive new records.

## Maintenance Task

The public shape and validation rules live in the [OpenAPI spec](openapi.json)
(`MaintenanceTask`, `CreateMaintenanceTaskBody`, `UpdateMaintenanceTaskBody`,
`RescheduleMaintenanceTaskBody`). Domain-only details:

- **`scheduleSeedDate`** is an immutable date-only creation baseline. It is the supplied
  `lastCompletedDate` or the UTC calendar date at creation when no completion was supplied; it is
  never exposed in API responses or replaced by the current date during a later edit.
- **`initialLastCompletedDate`** preserves the nullable completion value supplied at creation so
  record deletion can restore the original uncompleted state. It is not exposed in API responses.
- **`nextDueOverride`** is a nullable, future-only one-cycle target set by the dedicated
  reschedule action. It makes the public `nextDue` equal the target without changing completion
  evidence or the immutable schedule seed. A changed interval or a successful task advance clears
  it; record correction retains it while reconciling `lastCompletedDate`. It is not exposed in API
  responses.
- **`revision`** is an internal per-task optimistic-concurrency counter. Task edits, record
  corrections that change derived task state, reschedules, and task deletion increment it atomically
  and carry the resulting value on their task events.

## Activity Entry

The public shape and validation rules live in the [OpenAPI spec](openapi.json)
(`ActivityResponse`, `ActivityEntry`, `ActivityAvailableFilters`). Domain-only
details:

- **`ownerId`** scopes the entry to the owning user and is never exposed in API
  responses.
- **`actorId`** is stored separately from `ownerId` for delegation/team attribution. For shared
  assets they may differ, and the API exposes the actor id plus the display-name snapshot carried
  by the event; telemetry never writes the display name.
- **Asset snapshots** (`asset_id`, `asset_name`, `asset_type`) are copied from
  the enriched event payload. Entries remain readable after an asset is renamed,
  archived, or after a task is deleted.
- **`source_event_id`** is unique. The queue consumer inserts entries
  idempotently from this id so at-least-once delivery cannot duplicate history.
- **Correction audit payloads** are retained in an internal `audit_snapshot_json` value for
  `maintenance_record_updated` and `maintenance_record_deleted` entries. The payload contains the
  normalized before/after or deleted record snapshot, including notes, with the original record
  `createdAt`; the public `GET /api/activity` read model remains compact and never exposes this
  payload, `taskId`, notes, or prior values.
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

| Event                        | Raised when                                         | Carries                                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AssetCreated`               | an asset is created                                 | event id, asset/owner/actor, asset snapshot, type, optional year, and History `activityEntryType` conclusion                                                                                                  |
| `MaintenanceRecordCreated`   | a maintenance record is created                     | event id, record/asset/owner/actor, asset snapshot, title, performed date, linked task id, and History `activityEntryType` conclusion                                                                         |
| `MaintenanceRecordUpdated`   | a maintenance record's title, date, or notes change | event id, record/asset/owner/actor snapshots, `createdAt`, resulting `recordRevision`, immutable linked task id, normalized before-and-after title/date/notes, and History `activityEntryType` conclusion     |
| `MaintenanceRecordDeleted`   | a maintenance record is hard-deleted                | event id, record/asset/owner/actor snapshots, `createdAt`, deleted-event `recordRevision`, immutable linked task id, normalized deleted title/date/notes snapshot, and History `activityEntryType` conclusion |
| `MaintenanceTaskCreated`     | a maintenance task is scheduled                     | event id, task/asset/owner/actor, asset snapshot, title, interval, resulting **`nextDue`**, and History `activityEntryType` conclusion                                                                        |
| `MaintenanceTaskUpdated`     | a task's title or interval is edited                | event id, task/asset/owner/actor, asset snapshot, title, interval, resulting **`nextDue`**, and History `activityEntryType` conclusion; published only when the edit changes a stored value                   |
| `MaintenanceTaskRescheduled` | a task's current due cycle is rescheduled           | event id, task/asset/owner/actor, asset snapshot, title, resulting **`nextDue`**, task revision, and `task_rescheduled` History conclusion; never carries a false completion                                  |
| `MaintenanceTaskAdvanced`    | a task is completed by a record                     | event id, task/record/asset/owner/actor, asset snapshot, title, performed date, resulting **`nextDue`**, and History `activityEntryType` conclusion                                                           |
| `MaintenanceTaskReconciled`  | a linked record correction changes task schedule    | event id, task/record/asset/owner/actor, asset snapshot, title, resulting `lastCompletedDate`/`nextDue`, and no duplicate completion History conclusion                                                       |
| `MaintenanceTaskDeleted`     | a maintenance task is removed                       | event id, task/asset/owner/actor, asset snapshot, title, and History `activityEntryType` conclusion                                                                                                           |
| `NotificationEmailUpdated`   | a user sets/changes their contact email             | event id and `userId` only (no address — PII stays out of the event)                                                                                                                                          |
| `NotificationEmailVerified`  | a user's contact email becomes verified             | event id and `userId` only (no address)                                                                                                                                                                       |
| `NotificationEmailRemoved`   | a user clears their contact email                   | event id and `userId` only (no address)                                                                                                                                                                       |
| `MaintenanceReminderCreated` | a due-soon reminder is created                      | event id, notification/task/asset/owner ids, notification type, system actor, and lead-days conclusion                                                                                                        |
| `ReminderEmailDispatched`    | an aggregated reminder email decision is recorded   | event id, email batch id, owner id, result (`sent` / `suppressed` / `failed` / `unknown`), suppress reason, and covered notification count; no email address or reminder copy                                 |
| `TeamCreated`                | a team is created                                   | event id, team/owner/actor, and team name                                                                                                                                                                     |
| `AssetSharedToTeam`          | an asset is shared to a team                        | event id, asset/owner/actor, asset name, team id + name                                                                                                                                                       |
| `AssetUnsharedFromTeam`      | an asset is returned to personal                    | event id, asset/owner/actor, asset name, team id + name (of the team it left)                                                                                                                                 |
| `AssetEdited`                | an asset's name and/or metadata is edited           | event id, asset/owner/actor, new and previous name, asset type, and `nameChanged`/`metadataChanged` flags                                                                                                     |

`MaintenanceTaskCreated` carries `taskRevision = 0`. Every later task mutation, including a
reschedule, carries the resulting revision after incrementing the prior value; `MaintenanceTaskDeleted` carries
`priorRevision + 1` immediately before deleting the task row. `MaintenanceTaskReconciled` carries
the resulting task revision but is not an Activity History event.

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
  `last_event_occurred_at` / `last_task_revision` for dedupe and
  `(taskRevision, kind, lowercase(eventId))` order
  resolution. `last_event_id` and `last_task_revision` are provenance snapshots only; the
  `notification_task_heads` row is the sole ordering authority. A partial unique
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
  `sweep_run_id`, `status` (`pending` / `sending` / `sent` / `suppressed` / `failed` / `unknown`),
  nullable `claim_token`, nullable `lease_expires_at`, nullable `next_attempt_at`, and a
  `retry_count` capped at three retries after the initial attempt. A claim token is unique per
  `sending` attempt and is cleared when a claim returns to `pending` or reaches a terminal state;
  provider-result and lease-reaper writes compare the stored token and unexpired lease in the same
  conditional update. `suppress_reason`, and the covered `notification_count` are also stored. The
  outbound consumer is idempotent on the batch id; `unknown` means the provider outcome may have
  been accepted and must not be retried automatically.
- **`notification_email_outbox`** — producer-side transactional outbox for
  reminder email jobs. The sweep writes this in the same D1 batch as
  `notifications`, fired reminder status updates, and `email_batches`; a later
  queue relay moves pending rows to the outbound reminder-email queue. Relay rows use
  `pending` / `sending` / `sent` / `failed`, a claim token and lease, and durable attempt count;
  confirmed pre-publication exhaustion sets both the outbox and `email_batches` to `failed`, while
  an unknown publication sets the outbox to `failed` and the batch to `unknown`; each terminal
  batch transition emits exactly one `ReminderEmailDispatched` observation.
- **`notification_ingested_events`** — dedupe markers keyed by source `event_id`; ordering is
  owned by `notification_task_heads`, while the scheduled reminder retains only event/revision
  provenance for diagnostics.
- **`notification_task_heads`** — one order/terminal marker per source task, storing the latest
  `task_revision`, marker `kind` (`legacy` / `bootstrap` / `real` / `terminal-delete`), canonical
  `event_id`, `current_next_due`, and status (`active` / `deleted`); this prevents an older event
  from reactivating a task after deletion, including when a legacy delete arrives after bootstrap.
- **`notification_dead_letters`** — durable copies of messages exhausted on the
  notification queues / DLQs, keyed uniquely by `(queue, queue_message_id)` so a permanently
  failing message is persisted once, not dropped or duplicated on redelivery. Existing rows use
  `legacy:<id>` until replayed.
- **`notification_sweep_runs`** — one durable row per deterministic cron `sweepRunId`, storing
  non-null `id` (primary key), `cron_name`, `scheduled_time_epoch_ms`, status `running` /
  `completed`, and created/completed timestamps, used to make a retried scheduled invocation reuse
  its reminder claims and email batches. `(cron_name, scheduled_time_epoch_ms)` is unique.
- **`notification_sweep_items`** — one non-null `(sweep_run_id, reminder_id)` primary-key claim row
  per reminder in a sweep, with foreign keys to `notification_sweep_runs` and
  `scheduled_reminders`, non-null `owner_id`, `claimed_at`, and `email_batch_id` referencing
  `email_batches`. Every committed item has exactly one batch, including a `suppressed` batch when
  no verified email exists, and the item's owner matches the batch owner.
- **`notification_migration_anomalies`** — unresolved bootstrap repair rows; any non-null
  `resolved_at` marks an operator-confirmed repair, and unresolved rows block deployment.
- **`maintenance_write_gate`** — a singleton operational row used only during the seed/revision
  migration rollout; `frozen` blocks maintenance writes while reads remain available, and `open`
  is the normal state. It is not exposed through the API.

## Storage mapping

| Domain concept                   | D1 table                                     | Notes                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                           | `users`                                      |                                                                                                                                                                                        |
| `Asset`                          | `assets`                                     | `metadata` is a JSON string column                                                                                                                                                     |
| `Team`                           | `teams` + `team_members`                     | unique index on `team_members.user_id` enforces one team per user                                                                                                                      |
| `MaintenanceRecord`              | `maintenance_records`                        | `performed_at` is a date-only text column; correction endpoints cannot change `task_id`, while task deletion explicitly unlinks it to null; `revision` supports correction concurrency |
| `MaintenanceTask`                | `maintenance_tasks`                          | Stores mutable `last_completed_date`/`next_due` plus immutable `schedule_seed_date` and nullable `initial_last_completed_date` used to rebuild a task after linked-record corrections  |
| `ActivityEntry`                  | `activity_entries`                           | append-only history projection, ordered by `occurred_at` then `id`                                                                                                                     |
| Activity outbox                  | `activity_event_outbox`                      | producer-side transactional outbox for the activity-history queue                                                                                                                      |
| Verification tokens              | `email_verification_tokens`                  | hashed, single-use, 24h TTL, scoped by `(user, email, purpose)`                                                                                                                        |
| Verification sends               | `email_verification_sends`                   | per-send audit rows backing the cooldown / per-address / per-user caps                                                                                                                 |
| Scheduled reminders              | `scheduled_reminders`                        | notifications' own cancelable schedule, keyed by source task                                                                                                                           |
| Notifications                    | `notifications`                              | durable in-app inbox; one per `(task, cycle)`                                                                                                                                          |
| Email batches                    | `email_batches`                              | one aggregated reminder email per owner per sweep                                                                                                                                      |
| Reminder email outbox            | `notification_email_outbox`                  | producer-side transactional outbox for aggregated reminder email jobs                                                                                                                  |
| Notification sweep runs          | `notification_sweep_runs`                    | deterministic cron-run identity for idempotent reminder claims                                                                                                                         |
| Notification sweep items         | `notification_sweep_items`                   | durable reminder-to-sweep claim association                                                                                                                                            |
| Notification events              | `notification_ingested_events`               | inbound event dedupe/order markers                                                                                                                                                     |
| Notification task heads          | `notification_task_heads`                    | latest per-task revision and terminal deletion marker                                                                                                                                  |
| Notification migration anomalies | `notification_migration_anomalies`           | unresolved bootstrap repairs block deployment                                                                                                                                          |
| Maintenance write gate           | `maintenance_write_gate`                     | singleton migration quiescence control, not an API entity                                                                                                                              |
| Notification DLQ                 | `notification_dead_letters`                  | durable copy of exhausted notification-queue messages                                                                                                                                  |
| Queue dead letters               | `dead_letters`                               | durable copy of malformed or exhausted activity queue messages                                                                                                                         |
| Auth (Better Auth)               | `user`, `session`, `account`, `verification` | **singular** names; auth infra, separate from the domain `users` table                                                                                                                 |

Timestamps are stored as ISO-8601 strings. Schema lives in
[`/migrations`](../../migrations) and is applied with
`wrangler d1 migrations apply`.
