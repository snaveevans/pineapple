---
name: notifications
description: An event-driven durable scheduler that turns enriched MaintenanceTask events into "maintenance due soon" reminders ~7 days before nextDue — one in-app notification per task, and a single aggregated email per user when they have a verified contact email
metadata:
  type: feature
---

# Notifications

**Status:** active
**Owner:** product and engineering
**Last Updated:** 2026-07-02
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [maintenance-task.md](./maintenance-task.md), [activity-history.md](./activity-history.md), [dashboard.md](./dashboard.md), [user-profile.md](./user-profile.md), [email-verification.md](./email-verification.md)

---

## Summary

Notifications proactively tell an owner-operator that scheduled maintenance is coming due,
instead of waiting for them to open the app and check the dashboard. About **7 days before a
task's `nextDue`**, the system surfaces a `maintenance_due_soon` reminder for the task's owner:
always as an entry in an **in-app inbox** (the bell control already present in the app shell,
[`docs/web/FEATURES.md`](../../web/FEATURES.md)), and — when the owner has a **verified contact
email** ([email-verification.md](./email-verification.md)) — also by email.

This is the **durable scheduler** consumer from
[ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md), and it is built the way
that ADR intends: **event-driven, not by polling the source**. When a task's next-due becomes
known — a task is created, or a completion advances it — the maintenance-task feature publishes
an **enriched (Smart) event** carrying the producer-owned conclusion (`nextDue`) plus the asset
snapshot and task title. Notifications **consumes** those events and records its **own**
cancelable "scheduled reminder" state, keyed by the source task. The maintenance-task feature
does **not** run anything on notifications' behalf and notifications **never reads
maintenance-task storage back** — the coupling ADR-0010 exists to forbid. Notifications then runs
**its own** scheduled (cron-like) sweep over **its own** state to create reminders and send
emails when their lead time arrives.

Two behaviors are load-bearing and called out here because they shape the whole design:

- **Reminders reschedule and cancel from later events, not from re-reading the task.** A new
  completion supersedes the pending reminder with one for the new cycle; a task deletion cancels
  it. The scheduler resolves these by event time/version, tolerating out-of-order and duplicated
  delivery ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)).
- **Email is aggregated per user.** If a single scheduler sweep produces more than one reminder
  for the same owner, they receive **one** email listing all of them — never one email per task.
  The in-app inbox still gets one entry per task; aggregation applies to the email channel only.

The lead time is a **consumer-owned policy** (ADR-0010) — it is not carried on any maintenance
event — and it is deliberately the **same 7-day boundary** the dashboard uses to mark a task
`soon` ([dashboard.md](./dashboard.md): a task is `soon` when `nextDue` is today or within the
next 7 calendar days). A reminder is, in effect, a **push of the moment a task enters the
`soon` bucket**; the two must share one lead-time constant so the inbox and the dashboard never
disagree.

Notifications is distinct from its neighbors: the [dashboard](./dashboard.md) is a **pull** view
of everything due now; [activity-history](./activity-history.md) is a backward-looking record of
what you **did**; Notifications is a forward-looking, **push** nudge about what needs attention,
with its own read/unread lifecycle. Email is the delivery channel decided in
[ADR-0012](../../decisions/0012-transactional-email-via-cloudflare-email-sending.md); this spec
owns the email **port**, its Worker binding/`wrangler` config, and which consumer sends.

The web app surfaces the inbox behind the shell's notifications control. UX intent (bell badge,
list layout, read styling, empty state, the "verify an email to also get these by email" prompt)
lives in [`docs/web/FEATURES.md`](../../web/FEATURES.md) when built; this spec defines the API
capability and behavior.

## Personas

- **Established owner-operator with due-soon tasks** — the primary recipient; wants a nudge
  before work is due, not after.
- **Owner-operator with several tasks due at once** — should get a single email that lists all of
  them, not an inbox-flooding burst of separate emails.
- **Owner-operator with a verified contact email** — gets reminders in the inbox **and** by email.
- **Owner-operator with no/unverified contact email** — still sees reminders in the in-app inbox,
  and is prompted to verify an email to also receive them by email. No email is sent ("suppress
  until verified").
- **Owner-operator who completes or deletes a task before the reminder** — should not get a stale
  reminder for work already done or a task that no longer exists.
- **Owner-operator reviewing the inbox** — reads notifications and marks them read to clear the
  unread badge.
- **New owner-operator with no tasks** — sees an empty inbox.
- **System: durable scheduler** — consumes enriched `MaintenanceTask*` events and maintains
  notifications' own cancelable scheduled-reminder state keyed by task; idempotent and
  order-tolerant.
- **System: reminder sweep (notifications' own cron)** — periodically scans **notifications' own**
  scheduled-reminder state for reminders whose lead time has arrived, creates the in-app
  notifications, and enqueues one aggregated email per owner. It never reads maintenance-task
  tables.
- **System: email delivery consumer** — a durable, idempotent queue consumer that sends the one
  aggregated email through the email port, resolves the verified contact email at send time, and
  records the outcome; retries transient failures and dead-letters permanent ones.
- **Future: team member / delegate** — a second person on the same fleet who might have their own
  inbox and channel preferences. Out of scope for v1; notifications record an `actorId` reserved
  for later attribution.

## User Stories

- As **DIYer Dale**, I get a **reminder about 7 days before a task is due** so that **I have time
  to plan and do the work**
- As **DIYer Dale with several tasks due at once**, I get **a single email listing all of them**
  so that **my inbox isn't flooded with one email per task**
- As **DIYer Dale**, I get **an email at my verified contact email when a reminder fires** so that
  **I hear about upcoming maintenance without opening the app**
- As **DIYer Dale with no verified contact email**, I **still see reminders in my in-app inbox**
  and am **prompted to verify an email** so that **I'm never blind, and I know how to also get
  them by email**
- As **DIYer Dale**, I can **open a notifications inbox and mark notifications read** so that **I
  can track and clear what needs my attention**
- As **DIYer Dale who completes or deletes a task before its reminder**, I **don't receive a stale
  reminder** so that **notifications stay trustworthy and relevant**
- As a **sys admin**, I can **know whether a reminder email actually went out or failed** so that
  **a silently undelivered reminder is detectable** (the ADR-0012 deliverability concern)

## The Durable Scheduler (event-driven)

Notifications builds its schedule by **consuming enriched maintenance-task events** and keeping
its own cancelable state. It does not poll, sweep, or read the maintenance-task tables — the
event payload carries everything it needs (Smart Events, ADR-0010).

| Consumed event                                         | Scheduler action                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `MaintenanceTaskCreated` (carries resulting `nextDue`) | Schedule a pending reminder for `(task, nextDue)`, fireAt = `nextDue − lead`, storing the asset/title/`nextDue` snapshot |
| `MaintenanceTaskAdvanced` (carries new `nextDue`)      | **Reschedule**: supersede the task's prior pending reminder and schedule a new one for the new `nextDue`                 |
| `MaintenanceTaskDeleted`                               | **Cancel** the task's pending reminder                                                                                   |

_Asset archive/unarchive would later add "cancel on suspend / reschedule on reactivate" on these
same handler paths, but that is **out of scope** for this spec and parked in
[archive-asset.md (backlog)](../backlog/archive-asset.md)._

- **Requires `nextDue` on the event.** For the scheduler to work without reading back,
  `MaintenanceTaskCreated` and `MaintenanceTaskAdvanced` must carry the resulting `nextDue` as a
  producer-owned conclusion, alongside the asset snapshot and title they already carry. ADR-0010
  already sanctions `nextDue` as an on-event domain date; the payloads must include it.
- **Own cancelable state, keyed by task.** Notifications keeps one pending scheduled reminder per
  task, with the snapshot, `nextDue`, computed `fireAt`, a status (`pending` / `fired` /
  `canceled` / `superseded`), and the ordering marker below. This is the "mutable, cancelable
  state keyed by the source entity" of the ADR-0010 durable scheduler.
- **Idempotent and order-tolerant** ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)):
  each event is deduped on its stable event id (redelivery is a no-op), and schedule-vs-cancel is
  resolved by **event time/version**, not arrival order — a late-arriving older event never
  overrides a newer one (e.g. a delete that occurred after an advance always wins, whatever order
  they are received in).
- **The reminder sweep is notifications' own cron.** Per
  [ADR-0013](../../decisions/0013-reminder-scheduler-via-cron-sweeps.md), a scheduled sweep scans **notifications'
  scheduled-reminder state** for `pending` reminders whose `fireAt` has arrived
  (`fireAt ≤ today`, date-only), and for each: creates the in-app notification (idempotent on
  `(taskId, nextDue)`) and marks the reminder `fired`. A reminder fires on the **first sweep on or
  after its `fireAt` date**. The sweep then aggregates per owner (below) and touches only
  notifications' own tables.
- **A reminder already inside the window when scheduled** — a task created or advanced with
  `nextDue ≤ 7 days` out (including already overdue) has `fireAt` in the past, so the **next**
  sweep fires it; there is no retroactive firing before the event was received.
- **Self-contained, no read-back ever (steady state).** Because the snapshot rides in from the
  event, both the scheduled-reminder row and the resulting notification render on their own — even
  after the task is deleted or the asset archived — exactly like
  [activity-history.md](./activity-history.md).
- **Bootstrapping the existing fleet (one-time backfill).** The scheduler learns tasks from
  events, so at launch a **one-time bootstrap** seeds the scheduled-reminder state from the tasks
  that already exist (tasks on active assets, keyed and deduped the same `(taskId, nextDue)` way).
  This bootstrap is a **one-time migration read** of the tasks table — **not** the steady-state
  event path — so the no-read-back rule for ongoing operation is intact. After it runs, all
  scheduling is event-driven; tasks created or advanced later never need backfilling. Without it,
  the existing fleet would get no reminders until each task is next completed.

## API Requirements

### Notification inbox read model

- [ ] Add `GET /api/notifications` as a protected application API endpoint
- [ ] The endpoint uses the resolved authenticated `User.id` as the ownership input; no `ownerId`
      is accepted from the request
- [ ] Only the caller's own notifications are ever returned; the response never exposes another
      user's notifications, `ownerId`, or auth-provider identifiers
- [ ] Notifications are returned newest first by `createdAt`, with a stable secondary tiebreak
      (e.g. notification id) so equal timestamps have a deterministic order
- [ ] The response includes an **unread count** for the caller (drives the shell's bell badge)
- [ ] Each notification includes: a stable `id`, a `type` (v1: `maintenance_due_soon`),
      `createdAt`, `readAt` (nullable), an asset snapshot (`id`, `name`, `type`), the task `title`
      snapshot, and the `nextDue` date — enough to render the row without a lookup
- [ ] The endpoint is cursor-paginated on the same pattern as
      [activity-history.md](./activity-history.md): a `nextCursor` when more exist, null/absent at
      the end; page size defaults to **20** and is capped at **50** at the Zod edge; the cursor is
      opaque
- [ ] Notifications are a **durable inbox** — persisted indefinitely with no auto-expiry or
      auto-deletion in v1; the read model is bounded by pagination, not by pruning. (History remains
      the separate audit record; see Out of Scope for deferred pruning.)
- [ ] Entries for deleted tasks and archived assets are still returned and fully renderable from
      their snapshot

### Marking read

- [ ] `POST /api/notifications/{notificationId}/read` marks a single notification read and returns
      the updated notification (or 204); marking an already-read notification is an idempotent
      success
- [ ] `POST /api/notifications/read-all` marks all of the caller's unread notifications read and
      returns the resulting unread count (0)
- [ ] Marking read operates only on the caller's own notifications; a `notificationId` that is
      unknown **or** belongs to another user returns 404 (existence is not revealed)
- [ ] There is no create, edit-content, or delete endpoint — notifications are system-generated
      and, in v1, are only read or marked read (see Out of Scope)

### Reminder creation (the notifications sweep)

- [ ] A one-time launch **bootstrap** seeds the scheduled-reminder state from existing tasks on
      active assets so the current fleet gets reminders; it is idempotent (safe to re-run), deduped
      on `(taskId, nextDue)`, and is the **only** place notifications reads the tasks table —
      steady-state scheduling stays event-driven
- [ ] Reminders are created only from notifications' own scheduled-reminder state; the sweep never
      reads maintenance-task or asset tables
- [ ] Each `pending` reminder whose `fireAt` has arrived produces exactly one
      `maintenance_due_soon` notification; creation is idempotent on `(taskId, nextDue)` so a
      repeated sweep never duplicates a reminder for the same cycle
- [ ] Each created notification carries the asset (`id`, `name`, `type`), task `title`, and
      `nextDue` snapshot copied from the scheduled-reminder state, so the inbox row is
      self-contained
- [ ] A reminder whose task was canceled (`MaintenanceTaskDeleted`) or superseded
      (`MaintenanceTaskAdvanced`) before the sweep is **not** fired
- [ ] The lead time is a single shared constant with the dashboard `soon` threshold
      ([dashboard.md](./dashboard.md)); the two are defined once, not independently

### Email delivery (aggregated per user)

- [ ] When a sweep fires one or more reminders for the same owner, that owner receives **at most
      one** email covering all of them — **never one email per notification**
- [ ] The aggregation unit is **a single sweep per owner**: reminders fired in the same sweep are
      combined; reminders fired in different sweeps (e.g. tasks due on different dates) are separate
      emails
- [ ] Aggregation applies to **email only** — the in-app inbox still receives one notification per
      task
- [ ] The aggregated email is sent only when the owner has a **verified** contact email
      ([user-profile.md](./user-profile.md) / [email-verification.md](./email-verification.md)),
      resolved **at send time** so a later address change or verification is reflected without
      rescheduling
- [ ] When the owner has **no** contact email or an **unverified** one, **no email is sent**; the
      suppression is recorded for the batch, and the per-task in-app notifications are still created
- [ ] The email lists each due task (asset name, task title, due date) and a link into the app; no
      presentation copy is defined by the API beyond that intent (the adapter/template owns wording)
- [ ] Email delivery is **at-least-once and decoupled** via the notifications queue + DLQ, on the
      same reliability pattern as [activity-history.md](./activity-history.md)
      ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)): the
      aggregated send job is enqueued atomically with the reminders it covers, the consumer is
      **idempotent on the batch id** so a redelivery cannot re-send, transient failures retry with
      backoff, and a permanently failing send is dead-lettered and durably persisted rather than
      left to expire
- [ ] The **outcome** of every aggregated send (`sent`, `suppressed`, `failed`) and the number of
      notifications it covered are recorded and observable, so a silently undelivered reminder is
      detectable — the deliverability requirement
      [ADR-0012](../../decisions/0012-transactional-email-via-cloudflare-email-sending.md) makes a
      condition of running the open-beta email provider

## Validation & Ownership

**Authentication:** The inbox and mark-read endpoints are available only to authenticated users; a
missing/invalid session returns 401 through the shared authentication middleware and the web
client redirects to `/login` at the API-client layer. The scheduler, the reminder sweep, and email
delivery are system processes with no interactive session; they act on behalf of the task owner
and never trust client input.

**Permissions:** Notifications are scoped entirely by the resolved `User.id`. Queries filter by
owner; the response never exposes another user's notifications, `ownerId`, or auth identifiers.
Marking read is owner-scoped; a foreign or unknown `notificationId` returns 404 (no existence
leak). There is no cross-user or team-wide visibility in v1.

**Validation (Zod HTTP edge, per [ADR-0007](../../decisions/0007-api-validation-boundary.md)):**

- `GET /api/notifications`: optional `cursor` (opaque string) and `limit` (integer within the
  supported range, default applied when absent); invalid params return 422. As with
  [activity-history.md](./activity-history.md), these are query params, so errors are not mapped to
  form fields.
- `POST /api/notifications/{notificationId}/read`: `notificationId` must be a valid UUID (422
  otherwise); no body.
- `POST /api/notifications/read-all`: no body.

**Date handling:** `createdAt`/`readAt` are UTC timestamps (instants). `nextDue` and the derived
`fireAt` are timezone-free `YYYY-MM-DD` calendar dates, consistent with
[maintenance-task.md](./maintenance-task.md); the 7-day lead is computed with date-only calendar
arithmetic, not timestamp subtraction.

## Edge Cases & Error States

| Scenario                                                    | Expected Behavior                                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No valid session on inbox/mark-read                         | 401; client redirects to `/login`                                                                                                                                 |
| Caller has no notifications                                 | Empty list, unread count 0; client shows an empty inbox state                                                                                                     |
| `MaintenanceTaskCreated` received, `nextDue` > 7 days out   | A pending reminder is scheduled; nothing fires until its `fireAt` arrives                                                                                         |
| `MaintenanceTaskCreated` received already inside the window | Pending reminder with `fireAt` in the past; the next sweep fires it (no retroactive firing before the event)                                                      |
| Reminder `fireAt` arrives                                   | One `maintenance_due_soon` notification created for that cycle                                                                                                    |
| Sweep runs again before the task advances                   | No duplicate — creation idempotent on (taskId, nextDue)                                                                                                           |
| `MaintenanceTaskAdvanced` received                          | Prior pending reminder superseded; a new one scheduled for the new `nextDue`; no reminder for the old cycle                                                       |
| `MaintenanceTaskDeleted` received before the reminder fires | Pending reminder canceled; nothing fires for that task                                                                                                            |
| Advance and delete events arrive out of order               | Resolved by event time/version — the later-occurring event wins regardless of arrival order                                                                       |
| A maintenance event is redelivered                          | No-op — deduped on the event id                                                                                                                                   |
| Several of one owner's reminders fire in the same sweep     | One aggregated email listing all of them; one inbox notification per task                                                                                         |
| Owner has a **verified** contact email                      | Aggregated email dispatched to that address                                                                                                                       |
| Owner has **no**/**unverified** contact email               | Per-task notifications created; **no email**; batch recorded `suppressed`; UI prompts to verify an email                                                          |
| Owner verifies an email after some suppressed reminders     | Future reminders email; already-suppressed past notifications are not retroactively emailed (v1)                                                                  |
| Aggregated email send transiently fails                     | Retried with backoff via the queue; not lost                                                                                                                      |
| Aggregated email send permanently fails                     | Dead-lettered and durably persisted; outcome recorded as `failed`; detectable, not silently dropped                                                               |
| Redelivery of the same aggregated send job                  | Idempotent on the batch id — the email is not sent twice                                                                                                          |
| Task on an asset that was archived                          | Until archive is a live action, a reminder may still fire — accepted, currently-unreachable gap; deferred design parked in [backlog](../backlog/archive-asset.md) |
| Mark-read on an already-read notification                   | Idempotent success                                                                                                                                                |
| Mark-read on a foreign or unknown `notificationId`          | 404; existence not revealed                                                                                                                                       |
| New notification arrives while the user views the inbox     | Appears on the next fetch/refresh; the inbox is not real-time                                                                                                     |
| `limit`/`cursor` out of range or malformed                  | 422 validation error                                                                                                                                              |
| Non-401 API error on the inbox (e.g. 500)                   | Client shows an inbox-level error state with retry                                                                                                                |

## Telemetry

**Request telemetry:**

| Route                                           | Operation                  |
| ----------------------------------------------- | -------------------------- |
| `GET /api/notifications`                        | `ListNotifications`        |
| `POST /api/notifications/{notificationId}/read` | `MarkNotificationRead`     |
| `POST /api/notifications/read-all`              | `MarkAllNotificationsRead` |

All three route patterns must be added to the operation-name mapping in `technicalTelemetry.ts`
and the Operation Name Mapping table in [telemetry.md](../cross-cutting/telemetry.md). The
scheduler, the sweep, and email delivery run outside the HTTP request path, so they are captured
as the domain events below, not request telemetry.

**Domain events consumed:** Notifications is a durable consumer of the existing enriched
`MaintenanceTaskCreated`, `MaintenanceTaskAdvanced`, and `MaintenanceTaskDeleted` events
([maintenance-task.md](./maintenance-task.md)). Delivery is durable (its own queue), idempotent on
the event id, and order-tolerant — the same posture as [activity-history.md](./activity-history.md).
Those events must carry `nextDue` for this consumer.

**Domain events produced:** Two events on a new dataset `pineapple_notification_domain_events`
(binding `NOTIFICATION_DOMAIN_TELEMETRY`). Telemetry handlers stay **thin selective readers**: they
record ids, enums, and outcomes only — **never** the email address, asset name, or task title, per
the [telemetry.md](../cross-cutting/telemetry.md) PII anti-pattern. The user-facing snapshot/title
fields ride in the notification store and the queue message, not in Analytics Engine.

### `MaintenanceReminderCreated` — when the sweep creates a reminder (index: `owner_id`)

One per notification (per task/cycle).

| Field        | Name                  | Value                                              |
| ------------ | --------------------- | -------------------------------------------------- |
| `indexes[0]` | —                     | `owner_id`                                         |
| `blobs[0]`   | `event_type`          | `"MaintenanceReminderCreated"`                     |
| `blobs[1]`   | `aggregate_type`      | `"Notification"`                                   |
| `blobs[2]`   | `notification_id`     | Notification UUID                                  |
| `blobs[3]`   | `notification_type`   | `"maintenance_due_soon"`                           |
| `blobs[4]`   | `maintenance_task_id` | Task UUID                                          |
| `blobs[5]`   | `asset_id`            | Asset UUID                                         |
| `blobs[6]`   | `owner_id`            | Owner UUID                                         |
| `blobs[7]`   | `actor_id`            | `"system"` (scheduler; reserved for delegation)    |
| `blobs[8]`   | `schema_version`      | `"v1"`                                             |
| `blobs[9]`   | `result`              | `"success"`                                        |
| `doubles[0]` | `count`               | Always `1`                                         |
| `doubles[1]` | `event_time_ms`       | Event timestamp (ms since epoch)                   |
| `doubles[2]` | `lead_days`           | Whole calendar days between creation and `nextDue` |

### `ReminderEmailDispatched` — per aggregated email decision (index: `owner_id`)

One per aggregated send (per owner per sweep). Records the outcome and how many notifications the
email covered — this is the deliverability signal ADR-0012 requires.

| Field        | Name                 | Value                                             |
| ------------ | -------------------- | ------------------------------------------------- |
| `indexes[0]` | —                    | `owner_id`                                        |
| `blobs[0]`   | `event_type`         | `"ReminderEmailDispatched"`                       |
| `blobs[1]`   | `aggregate_type`     | `"Notification"`                                  |
| `blobs[2]`   | `email_batch_id`     | Aggregated-send UUID (idempotency key)            |
| `blobs[3]`   | `owner_id`           | Owner UUID                                        |
| `blobs[4]`   | `schema_version`     | `"v1"`                                            |
| `blobs[5]`   | `result`             | `"sent"`, `"suppressed"`, or `"failed"`           |
| `blobs[6]`   | `suppress_reason`    | `"no_contact_email"`, `"unverified"`, or `"none"` |
| `doubles[0]` | `count`              | Always `1`                                        |
| `doubles[1]` | `event_time_ms`      | Event timestamp (ms since epoch)                  |
| `doubles[2]` | `notification_count` | Number of notifications covered by this email     |

## Implementation Requirements

- Populate `nextDue` on the enriched `MaintenanceTaskCreated` and `MaintenanceTaskAdvanced` event
  payloads where they are constructed in the application layer. The thin telemetry blobs stay
  PII-free and unchanged.
- Add two dedicated queues, each with its own DLQ: one inbound queue for the `MaintenanceTask*`
  notification consumer, and one outbound queue for aggregated email delivery. The split provides
  per-role isolation per [ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md):
  a stuck email send cannot block event ingestion.
- Add both queue bindings/consumers to `apps/api/wrangler.jsonc` and the matching idempotent queue
  creation entries to `.github/workflows/deploy.yml`. DLQs are durably drained into records; they
  are not just holding pens.
- Add the email-sending application port, the Cloudflare Email Sending infrastructure adapter, the
  Worker binding/`wrangler` config, and the sending domain's SPF/DKIM/DMARC in Cloudflare DNS.
  Domain and application code stay provider-agnostic.
- Adding the scheduler and inbox introduces new tables such as `scheduled_reminders` and
  `notifications`, plus new branded ids such as `NotificationId` and a scheduled-reminder id.
  Update [data-model.md](../../reference/data-model.md), add the inbox and "verify an email to
  also get these by email" states to [`docs/web/FEATURES.md`](../../web/FEATURES.md), and
  regenerate the OpenAPI document from the new Zod route specs.

## Out of Scope

- **Notification types other than `maintenance_due_soon`** — the inbox, scheduler, and event shape
  are built to extend (registration renewals, inspections), but v1 ships the one due-soon reminder
- **Configurable or per-task lead times** — 7 days is fixed for v1 (a consumer-owned policy per
  ADR-0010); per-user/per-task lead-time preferences are future work
- **Preferred local send hour** — v1 sends on the first sweep on or after `fireAt`; a preferred
  local send hour such as 8am needs a stored user timezone and is future work
- **Overdue escalation / repeat reminders** — v1 sends a single reminder per due-cycle; on-due and
  overdue re-nudges are future work
- **A scheduled daily/weekly digest across sweeps** — v1 aggregates per sweep only; a fixed-time
  summary email is future work
- **Auto-resolving a notification when its task is later completed** — completing a task does not
  retroactively clear or mark read an already-created reminder in v1 (a superseding
  `MaintenanceTaskAdvanced` only prevents the _old cycle's_ reminder from firing; it does not touch
  a reminder already fired)
- **Snooze, dismiss/delete, or muting** a notification — v1 supports read / mark-all-read only
- **Auto-pruning / expiring notifications** — v1 keeps a durable inbox with no auto-deletion; a
  retention window (prune read/old entries) is future work
- **Channels other than in-app + email** — no SMS, push, or webhooks
- **Real-time/live inbox updates** — the inbox refreshes on fetch, not via push
- **Retroactively emailing suppressed past reminders** after a later verification
- **Cancel-on-archive** — archive is currently a dormant field with no action or event. Until
  archive becomes a real action, a reminder for a task on an out-of-band archived asset may still
  fire; the worked-out cascade is parked in [archive-asset.md](../backlog/archive-asset.md).
- **The contact-email value, its endpoints, and the verification flow** — owned by
  [user-profile.md](./user-profile.md) and [email-verification.md](./email-verification.md)
- **Cross-user or team-wide notifications** — single-owner scope in v1

## Future Considerations

- Team/delegate notifications. v1 records `actorId` (`"system"`) separately from `ownerId` for
  future attribution, but does not display an actor or support cross-user inboxes.
- Harden reminder-email dispatch with an atomic claim step before calling the email provider. v1
  accepts the at-least-once queue edge for aggregated reminder emails; a future pass could add a
  `pending` -> `sending` transition on `email_batches` so concurrent redeliveries do not both send.
  This reduces duplicate sends but does not fully eliminate the crash-after-send edge without
  provider-level idempotency.
