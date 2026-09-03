---
name: notifications
description: An event-driven durable scheduler that turns enriched MaintenanceTask events into "maintenance due soon" reminders ~7 days before nextDue — one in-app notification per task, and a single aggregated email per user when they have a verified contact email; reminders can be snoozed one day at a time from the dashboard without changing the task schedule
metadata:
  type: feature
---

# Notifications

**Status:** in-progress
**Owner:** product and engineering
**Last Updated:** 2026-09-03
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
known — a task is created, a completion advances it, or a record correction recomputes it — the maintenance-task feature publishes
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
  it. The scheduler resolves these by `(taskRevision, kind, lowercase(eventId))`, tolerating out-of-order and duplicated
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

A reminder can also be **snoozed from the dashboard for one day at a time**
([dashboard.md](./dashboard.md) `S6`). Snooze is **reminder-level state owned by this feature**,
stored on the task's current reminder cycle: it defers when the reminder next fires — and
re-arms a reminder that already fired so it fires again after expiry — while the task's
`nextDue`, recurrence, urgency, and completion evidence are untouched
([maintenance-task.md](./maintenance-task.md) owns those). Snooze is therefore distinct from
rescheduling a task, and per-entry inbox actions (dismiss/mute) stay out of scope
([#186](https://github.com/snaveevans/pineapple/issues/186)).

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
- **Owner-operator who can't act on a reminder yet** — snoozes it from the dashboard for one day
  at a time so the nudging stops without pretending the work is done or moving the due date.
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
- As **DIYer Dale who isn't ready for a task the app reminded him about**, I can **snooze the
  reminder for one day** so that **it stops nudging me today and comes back tomorrow, while the
  task stays genuinely due on its real date**
- As **DIYer Dale who completes, reschedules, or deletes a task before its reminder**, I **don't receive a stale
  reminder** so that **notifications stay trustworthy and relevant**
- As **DIYer Dale who corrects or deletes a linked maintenance record**, I **don't receive a
  reminder for the superseded schedule** so that **notifications follow the corrected task state**
- As a **sys admin**, I can **know whether a reminder email actually went out or failed** so that
  **a silently undelivered reminder is detectable** (the ADR-0012 deliverability concern)

## The Durable Scheduler (event-driven)

Notifications builds its schedule by **consuming enriched maintenance-task events** and keeping
its own cancelable state. It does not poll, sweep, or read the maintenance-task tables — the
event payload carries everything it needs (Smart Events, ADR-0010).

| Consumed event                                            | Scheduler action                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `MaintenanceTaskCreated` (carries resulting `nextDue`)    | Schedule a pending reminder for `(task, nextDue)`, fireAt = `nextDue − lead`, storing the asset/title/`nextDue` snapshot |
| `MaintenanceTaskAdvanced` (carries new `nextDue`)         | **Reschedule**: supersede the task's prior pending reminder and schedule a new one for the new `nextDue`                 |
| `MaintenanceTaskUpdated` (carries resulting `nextDue`)    | Refresh the pending snapshot; if `nextDue` changed, supersede the prior cycle and schedule the new one                   |
| `MaintenanceTaskReconciled` (carries resulting `nextDue`) | **Reschedule**: supersede the task's prior pending reminder after a linked record correction changes the schedule        |
| `MaintenanceTaskDeleted`                                  | **Cancel** the task's pending reminder                                                                                   |

Maintenance-task `S5` ([#235](https://github.com/snaveevans/pineapple/issues/235)) will add
`MaintenanceTaskRescheduled` to this consumer. It carries the resulting `nextDue` and follows the
same supersede transition as `MaintenanceTaskAdvanced`, without maintenance-task storage read-back.

_Asset archive/unarchive would later add "cancel on suspend / reschedule on reactivate" on these
same handler paths, but that is **out of scope** for this spec and parked in
[archive-asset.md (backlog)](../backlog/archive-asset.md)._

- **Requires `nextDue` on the event.** For the scheduler to work without reading back,
  `MaintenanceTaskCreated`, `MaintenanceTaskUpdated`, `MaintenanceTaskAdvanced`, and
  `MaintenanceTaskReconciled` must carry the resulting `nextDue` as a
  producer-owned conclusion, alongside the asset snapshot and title they already carry. ADR-0010
  already sanctions `nextDue` as an on-event domain date; the payloads must include it. `S5` adds
  the same payload requirement to `MaintenanceTaskRescheduled`.
- **Own cancelable state, keyed by task.** Notifications keeps one pending scheduled reminder per
  task, with the snapshot, `nextDue`, computed `fireAt`, an optional `snoozedUntil` snooze date
  (see [Snoozing a reminder](#snoozing-a-reminder)), a status (`pending` / `fired` /
  `canceled` / `superseded`), and the ordering marker below. This is the "mutable, cancelable
  state keyed by the source entity" of the ADR-0010 durable scheduler.
- **Task heads are terminal and orderable.** A `notification_task_heads` row stores the latest
  accepted `(taskRevision, kind, lowercase(eventId))`, `currentNextDue`, and an `active`/`deleted` terminal state for each task. A
  delete advances the head and marks it `deleted`; this marker remains even when every scheduled
  cycle row is canceled, so an older or duplicated event cannot recreate a reminder. Maintenance
  task ids are never reused, so a terminal head cannot be confused with a later task.
- **Revision and bootstrap ordering.** A new task starts at `taskRevision = 0`; the launch bootstrap
  writes a marker with `kind = bootstrap` and the deterministic id
  `bootstrap:<lowercase-taskId>:<nextDue>` at revision 0 only when no newer marker exists. A real
  event has `kind = real` and always outranks a bootstrap marker at revision 0. Otherwise compare
  `(taskRevision, kind, lowercase(eventId))` lexicographically: higher revision wins, `real` wins
  over `bootstrap` at a tie, and the higher canonical event id wins among equal kinds. An equal id
  is a duplicate and is ignored. An incoming event with a lower revision than the stored task head
  is stale and is ignored. `MaintenanceTaskDeleted` is a terminal marker, not merely another kind:
  a real delete uses its incremented revision, while a legacy delete lacking a revision is accepted
  at revision 0 when no higher-revision head exists and outranks legacy/bootstrap revision-0
  markers. Once a delete head is accepted, no later event may reactivate that task, including a
  late real revision-0 marker. A legacy delete never overrides an already accepted higher-revision
  head.
- **Legacy message cutover.** A queued pre-cutover message that lacks `taskRevision` or `kind` is
  normalized to `taskRevision = 0`, `kind = legacy`, and its canonical lowercase event id. A
  legacy non-delete message has precedence `legacy < bootstrap < real`, so it cannot overwrite a
  bootstrap head while a real revision-0 event can. A legacy `MaintenanceTaskDeleted` follows the
  terminal-delete rule above instead of that ordinary kind precedence. This keeps the queue live
  during deployment; no manual queue drain is required.
- **Idempotent and order-tolerant** ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)):
  each event is deduped on its stable event id (redelivery is a no-op), and schedule-vs-cancel is
  resolved by `(taskRevision, kind, lowercase(eventId))` lexicographically, not arrival order — a late-arriving older
  event never overrides a newer one (e.g. a delete that occurred after an advance always wins,
  whatever order they are received in). `taskRevision` is incremented atomically by every
  task-affecting mutation and is carried on the task event.
- **Atomic ingestion:** The consumer compares the incoming marker with the task head and updates
  the head, cycle statuses, and target cycle in one D1 transaction. A losing marker makes no cycle
  change; a winning marker is committed before the message is acknowledged. The event-id dedupe
  row and cycle transition are part of that same transaction.
- **The reminder sweep is notifications' own cron.** Per
  [ADR-0013](../../decisions/0013-reminder-scheduler-via-cron-sweeps.md), a scheduled sweep scans **notifications'
  scheduled-reminder state** for `pending` reminders whose **effective fire date** has arrived
  (`max(fireAt, snoozedUntil) ≤ today`, date-only), and for each: creates the in-app notification
  for the cycle (the first fire inserts it; a snooze re-fire re-activates the existing row, see
  below) and marks the reminder `fired`, clearing any `snoozedUntil`. A reminder fires on the
  **first sweep on or after its effective fire date**. The sweep then aggregates per owner
  (below) and touches only notifications' own tables.
- **A reminder already inside the window when scheduled** — a task created or advanced with
  `nextDue ≤ 7 days` out (including already overdue) has `fireAt` in the past, so the **next**
  sweep fires it; there is no retroactive firing before the event was received.
- **Snooze defers the reminder, never the schedule.** `snoozedUntil` is a timezone-free
  `YYYY-MM-DD` date computed server-side as `todayUtc + 1` calendar day at snooze time — the
  client never supplies a date. The effective fire date is `max(fireAt, snoozedUntil)`, so a
  snooze can only postpone, never accelerate: snoozing a reminder whose natural `fireAt` is
  still in the future is permitted but inert until that date. Re-snoozing replaces the stored
  `snoozedUntil` (one snooze per cycle); there is **no un-snooze in v1** — expiry or a cycle
  transition is the only way out.
- **Snoozing a fired cycle re-arms it.** Snooze is the **only** sanctioned `fired → pending`
  transition: the cycle returns to `pending` with its stored `fireAt` unchanged (already in the
  past), so the first sweep on or after `snoozedUntil` fires it again. A re-fire **re-activates
  the cycle's existing inbox row** — clearing `readAt` and refreshing `createdAt` so the entry
  re-surfaces at the top of the inbox — and never inserts a duplicate row: the
  `(taskId, nextDue)` uniqueness holds. The aggregated email re-sends through the normal sweep
  path.
- **Self-contained, no read-back ever (steady state).** Because the snapshot rides in from the
  event, both the scheduled-reminder row and the resulting notification render on their own — even
  after the task is deleted or the asset archived — exactly like
  [activity-history.md](./activity-history.md).

- **Cycle transitions are explicit.** The cycle key is `(taskId, nextDue)`. A new `nextDue`
  supersedes the current active cycle and creates or reuses one pending row for the new cycle. The
  current active cycle is the `currentNextDue` stored on the task head. If an accepted event's
  `nextDue` equals it, the cycle keeps its current status; a winning event replaces the snapshot
  only when that status is `pending`, and leaves `fired`, `superseded`, and `canceled` rows unchanged.
  If it differs, the old pending cycle becomes `superseded` and the target cycle is created or
  reused. A
  previously seen cycle whose reminder has not fired (`pending` or `superseded`) is reused or
  reactivated instead of inserted again. Only `superseded` cycles can reactivate; `canceled` means
  task deletion and is terminal. A cycle whose reminder already fired remains `fired` — snooze is
  the only exception (see "Snoozing a fired cycle re-arms it" above) — and it cannot
  create another in-app notification or email. An event with the current `nextDue` does not create
  a new cycle or change its fire status. If the current cycle is `pending`, the winning event
  replaces its asset/title/task snapshot in the same transaction; if the cycle is `fired`,
  `superseded`, or `canceled`, the cycle row and its historical snapshot are unchanged.
  `snoozedUntil` is part of this state machine: it is set only by a snooze and **cleared by every
  other winning transition** — a supersede drops it, and reusing or reactivating a previously seen
  cycle clears any stale snooze stored on that row, so a reactivated cycle never resurrects an old
  snooze. Only a cycle-preserving event (a title-only edit, or a reconciliation whose `nextDue` is
  unchanged) keeps a snooze in place.
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

### Snoozing a reminder

- [ ] `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/snooze` accepts exactly
      `{ durationDays: 1 }` and returns `{ taskId, snoozedUntil }` with status 200;
      `durationDays` is the literal `1` in v1 — a missing or different value, or any unknown
      field, returns 422 (future duration options widen this schema without changing its shape)
- [ ] `snoozedUntil = todayUtc + 1` calendar day, computed server-side as a timezone-free
      `YYYY-MM-DD` date; the client never supplies a date and the snooze is one day by definition
- [ ] The worker's route handler performs the shared task-then-asset-then-access check (same
      order as task edit/reschedule); the snooze use case then resolves the task's current cycle
      from `notification_task_heads.currentNextDue` — notifications' own state — and never reads
      maintenance-task storage. This is the HTTP authorization path, not a durable-consumer
      read-back; ADR-0010's no-read-back rule governs the scheduler and consumers
- [ ] Snoozing a `pending` cycle defers its next fire to `snoozedUntil`; snoozing an
      already-`fired` cycle re-arms it (status back to `pending`, `fireAt` unchanged) so the
      first sweep on or after `snoozedUntil` fires it again; the effective fire date is always
      `max(fireAt, snoozedUntil)` — a snooze never accelerates
- [ ] A re-fire re-activates the cycle's existing inbox notification — clearing `readAt` and
      refreshing `createdAt` so the entry re-surfaces — and never inserts a second notification
      for the same `(taskId, nextDue)`; the aggregated email re-sends through the normal sweep
      path
- [ ] Snooze is available to any authenticated user with access to the task (owner or
      team-shared, same as task edit/reschedule); the reminder itself remains keyed to the
      task's owner
- [ ] The snooze write is conditional on the head's current cycle (status `pending` or `fired`
      and `nextDue = currentNextDue`); a race with a cycle transition retries against fresh
      head state, mirroring task-mutation concurrency, and returns 409 after retries are
      exhausted
- [ ] A task with no reminder state (no task head, or no row for the current cycle) returns 404
      and is logged as an anomaly; a current cycle whose status is neither `pending` nor `fired`
      fails closed as an invariant violation; the operation never fabricates a reminder row
- [ ] A deleted task's head is terminal: snoozing it returns 404, and the existing delete-cancel
      path drops the snooze with the canceled cycle
- [ ] Snooze is a notifications-side mutation: it never changes the task's `nextDue`,
      `lastCompletedDate`, recurrence, urgency, or completion evidence, publishes no
      `MaintenanceTask*` event, writes no activity-history entry, and never creates a
      maintenance record
- [ ] The maintenance write gate (`503 maintenance_write_frozen`) does **not** apply to snooze —
      it guards maintenance-task storage, and snooze writes notifications-owned state only

### Reminder creation (the notifications sweep)

- [ ] A one-time launch **bootstrap** seeds the scheduled-reminder state from existing tasks on
      active assets so the current fleet gets reminders; it is idempotent (safe to re-run), deduped
      on `(taskId, nextDue)`, and is the **only** place notifications reads the tasks table —
      steady-state scheduling stays event-driven
- [ ] Reminders are created only from notifications' own scheduled-reminder state; the sweep never
      reads maintenance-task or asset tables
- [ ] Each `pending` reminder whose effective fire date (`max(fireAt, snoozedUntil)`) has arrived
      produces exactly one `maintenance_due_soon` notification; creation is idempotent on
      `(taskId, nextDue)` so a repeated sweep never duplicates a reminder for the same cycle —
      a snooze re-fire re-activates the existing row instead of inserting a duplicate
- [ ] Each created notification carries the asset (`id`, `name`, `type`), task `title`, and
      `nextDue` snapshot copied from the scheduled-reminder state, so the inbox row is
      self-contained
- [ ] A reminder whose task was canceled (`MaintenanceTaskDeleted`) or superseded
      (`MaintenanceTaskAdvanced`, `MaintenanceTaskRescheduled`, or `MaintenanceTaskReconciled`) before the sweep is **not** fired
- [ ] A `MaintenanceTaskReconciled` event whose `nextDue` is unchanged creates no new reminder cycle or fire-status change; if it wins `(taskRevision, kind, lowercase(eventId))` ordering, it replaces the pending snapshot and marker, while fired/superseded/canceled cycle rows remain unchanged
- [ ] A reconciliation to a previously seen cycle updates or reactivates an unfired scheduled-reminder row; a cycle that already fired remains fired (snooze aside) and never creates a duplicate in-app notification or email; reactivating a previously seen cycle clears any stale snooze stored on it
- [ ] Reconciliation, task-update, reschedule, advance, and delete ingestion is idempotent by source event id and task cycle, and resolves duplicate or out-of-order delivery using `(taskRevision, kind, lowercase(eventId))` ordering
- [ ] The lead time is a single shared constant with the dashboard `soon` threshold
      ([dashboard.md](./dashboard.md)); the two are defined once, not independently

### Email delivery (aggregated per user)

- [ ] When a sweep fires one or more reminders for the same owner, that owner receives **one
      logical email batch** covering all of them — **never one logical email per notification**;
      `email_batches` contains one logical batch row and only one send attempt is in flight at a
      time
- [ ] The aggregation unit is **a single sweep per owner**: reminders fired in the same sweep are
      combined; reminders fired in different sweeps (e.g. tasks due on different dates) are separate
      emails. Each scheduled invocation derives the canonical string
      `sweepRunId = "maintenance-reminders:" + cronName + ":" + String(scheduledTimeEpochMs)`;
      due reminders are claimed for that run in the same transaction, and the unique key
      `(sweepRunId, ownerId)` guarantees one logical batch even if the invocation is retried.
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
      aggregated send outbox row is committed atomically with the reminders it covers; publication
      to the outbound queue is eventual and idempotent, and the consumer is
      **idempotent on the batch id** so queue redelivery or concurrent consumers cannot claim two
      sends at once. The consumer atomically claims `pending -> sending` with a lease; a confirmed
      pre-acceptance transient failure releases it to `pending` for exponential backoff, up to
      three additional attempts, while
      a confirmed provider acceptance becomes `sent`, a permanent rejection becomes `failed`, and
      a timeout/unknown outcome becomes `unknown` and is never retried. A `sending` claim has a
      five-minute lease; if it expires without a confirmed provider result, the next consumer
      atomically marks the batch `unknown` and never retries it. A provider acceptance followed by
      a Worker crash can still produce a physical duplicate in v1; this edge is observable as one
      batch id and is not retried deliberately.
- [ ] Email state transitions are fenced by a claim token: `pending -> sending` stores a unique
      token and a five-minute lease; confirmed pre-acceptance transient failures move back to
      `pending` with retry delays of 1, 2, and 4 minutes for retries 1, 2, and 3; a fourth such
      failure moves to `failed` and a durable DLQ record; confirmed acceptance moves to `sent`;
      permanent rejection moves to `failed`; timeout or unknown outcome moves to terminal
      `unknown`. A scheduled lease reaper atomically changes expired `sending` rows to `unknown`.
      A late provider result whose claim token no longer matches, or whose row is terminal, is
      recorded as an observation only and cannot change state or trigger another send. Every
      provider-result update is conditional on `status = 'sending'`, the matching claim token,
      and `lease_expires_at > now`; a result that arrives after lease expiry cannot mark the batch
      `sent`. The lease reaper is the only recovery path for an abandoned claim and marks it
      terminal `unknown`.
- [ ] The durable email transition table is:
      `pending -> sending` only when `next_attempt_at` is null or due, storing a fresh token and
      `lease_expires_at = now + 5 minutes`; `sending -> pending` only for the worker holding that
      token after a confirmed pre-acceptance transient failure, incrementing `retry_count` and
      setting `next_attempt_at` to `now + 1/2/4 minutes` for retries 1/2/3; the same failure when
      `retry_count = 3` becomes terminal `failed` and writes a durable DLQ row; `sending -> sent`
      and `sending -> failed` for provider results require the same token and an unexpired lease;
      the lease reaper alone performs `sending -> unknown` after expiry; `pending -> suppressed`
      is used when send-time contact-email verification fails. `sent`, `suppressed`, `failed`, and
      `unknown` are terminal and all terminal transitions clear the token, lease, and retry time.
- [ ] The **outcome** of every aggregated send (`sent`, `suppressed`, `failed`, `unknown`) and the number of
      notifications it covered are recorded in the durable `email_batches` row and emit exactly one
      `ReminderEmailDispatched` observation after the terminal transition. Operators can query the
      internal row and telemetry observation; no public email-delivery endpoint is required in v1,
      so a silently undelivered reminder is still detectable — the deliverability requirement
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
leak). Snoozing follows the task-access model — any user who can edit or reschedule the task
(owner or team-shared) may snooze its reminder — while the reminder state remains keyed to the
task's owner. There is no cross-user or team-wide visibility in v1.

**Validation (Zod HTTP edge, per [ADR-0007](../../decisions/0007-api-validation-boundary.md)):**

- `GET /api/notifications`: optional `cursor` (opaque string) and `limit` (integer within the
  supported range, default applied when absent); invalid params return 422. As with
  [activity-history.md](./activity-history.md), these are query params, so errors are not mapped to
  form fields.
- `POST /api/notifications/{notificationId}/read`: `notificationId` must be a valid UUID (422
  otherwise); no body.
- `POST /api/notifications/read-all`: no body.
- `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/snooze`: body is exactly
  `{ durationDays: 1 }` — `durationDays` required and literally `1`; a different value, a
  missing field, or an unknown field returns 422. A request body that is valid JSON but not an
  object returns 422 with the shared pinned message `Request body must be a JSON object.`;
  missing/non-`application/json` Content-Type or malformed JSON returns 400 (cross-cutting,
  unpinned). No query parameters.

**Date handling:** `createdAt`/`readAt` are UTC timestamps (instants). `nextDue` and the derived
`fireAt` are timezone-free `YYYY-MM-DD` calendar dates, consistent with
[maintenance-task.md](./maintenance-task.md); the 7-day lead is computed with date-only calendar
arithmetic, not timestamp subtraction.

## Edge Cases & Error States

| Scenario                                                                        | Expected Behavior                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No valid session on inbox/mark-read                                             | 401; client redirects to `/login`                                                                                                                                                          |
| Caller has no notifications                                                     | Empty list, unread count 0; client shows an empty inbox state                                                                                                                              |
| `MaintenanceTaskCreated` received, `nextDue` > 7 days out                       | A pending reminder is scheduled; nothing fires until its `fireAt` arrives                                                                                                                  |
| `MaintenanceTaskCreated` received already inside the window                     | Pending reminder with `fireAt` in the past; the next sweep fires it (no retroactive firing before the event)                                                                               |
| Reminder `fireAt` arrives                                                       | One `maintenance_due_soon` notification created for that cycle                                                                                                                             |
| Sweep runs again before the task advances                                       | No duplicate — creation idempotent on (taskId, nextDue)                                                                                                                                    |
| `MaintenanceTaskAdvanced` received                                              | Prior pending reminder superseded; a new one scheduled for the new `nextDue`; no reminder for the old cycle                                                                                |
| `S5` `MaintenanceTaskRescheduled` received                                      | Prior pending reminder superseded; a new one is scheduled for the user-selected future `nextDue`; no maintenance-task read-back occurs                                                     |
| `S5` reschedule arrives after the prior cycle fired                             | The fired reminder remains historical; the new future cycle is scheduled normally and does not duplicate the already-fired notification                                                    |
| `MaintenanceTaskDeleted` received before the reminder fires                     | Pending reminder canceled; nothing fires for that task                                                                                                                                     |
| Advance and delete events arrive out of order                                   | Resolved by `(taskRevision, kind, lowercase(eventId))` — the higher task revision wins regardless of arrival order                                                                         |
| A maintenance event is redelivered                                              | No-op — deduped on the event id                                                                                                                                                            |
| Several of one owner's reminders fire in the same sweep                         | One aggregated email listing all of them; one inbox notification per task                                                                                                                  |
| Two cron invocations share a scheduled timestamp                                | Unique `(cronName, scheduledTimeEpochMs)` reuses one `sweepRunId`; reminder claims, notifications, batches, and outbox rows are not duplicated                                             |
| Sweep crashes before its D1 transaction commits                                 | No reminder is marked fired; the next invocation reuses the run/items and performs the complete transaction                                                                                |
| Sweep crashes after its D1 transaction commits                                  | Fired reminders, sweep items, notifications, email batch, and outbox row are durable; only queue relay remains to retry                                                                    |
| Owner has a **verified** contact email                                          | Aggregated email dispatched to that address                                                                                                                                                |
| Owner has **no**/**unverified** contact email                                   | Per-task notifications created; **no email**; batch recorded `suppressed`; UI prompts to verify an email                                                                                   |
| Owner verifies an email after some suppressed reminders                         | Future reminders email; already-suppressed past notifications are not retroactively emailed (v1)                                                                                           |
| Aggregated email send transiently fails                                         | Retried with backoff via the queue; not lost                                                                                                                                               |
| Aggregated email send permanently fails                                         | Dead-lettered and durably persisted; outcome recorded as `failed`; detectable, not silently dropped                                                                                        |
| Redelivery of the same aggregated send job                                      | Idempotent on the batch id — no second in-flight claim; only confirmed pre-acceptance transient failures are retried; provider crash-after-accept duplicates remain the documented v1 edge |
| Task on an asset that was archived                                              | An existing scheduled reminder fires in v1; archiving does not cancel a task or reminder in this slice, and archive suspension remains deferred to [backlog](../backlog/archive-asset.md)  |
| Mark-read on an already-read notification                                       | Idempotent success                                                                                                                                                                         |
| Mark-read on a foreign or unknown `notificationId`                              | 404; existence not revealed                                                                                                                                                                |
| Snooze a `pending` reminder whose natural `fireAt` is in the future             | Permitted but inert until `fireAt` — effective fire date is `max(fireAt, snoozedUntil)`; a snooze never accelerates                                                                        |
| Snooze a `pending` reminder whose `fireAt` has arrived (pre-sweep window)       | Today's sweep does not fire it; the first sweep on or after `snoozedUntil` does                                                                                                            |
| Snooze an already-`fired` cycle                                                 | Re-arms to `pending`; re-fires on the first sweep on or after `snoozedUntil`; the inbox row is re-activated (unread, re-dated), not duplicated, and the email re-sends                     |
| Re-snooze before expiry                                                         | `snoozedUntil` replaced (server-computed `todayUtc + 1`); still one snooze per cycle; no un-snooze in v1                                                                                   |
| Task completed, rescheduled, or interval-edited while snoozed                   | Cycle superseded; snooze dropped; the new cycle starts unsnoozed with its own `fireAt`                                                                                                     |
| Title-only edit or same-`nextDue` reconciliation while snoozed                  | Cycle preserved; snooze kept                                                                                                                                                               |
| Reconciliation rewinds `nextDue` to a previously seen cycle                     | The reactivated cycle's stored snooze is cleared — a stale snooze never resurrects                                                                                                         |
| Task deleted while snoozed                                                      | Existing cancel path wins; the snooze is gone with the canceled cycle; snoozing the deleted task returns 404                                                                               |
| Snooze on a task with no reminder state (no head/current-cycle row)             | 404, logged as an anomaly; state is never fabricated                                                                                                                                       |
| Snooze body invalid (missing/non-`1` `durationDays`, unknown field, non-object) | 422; non-object JSON body uses the shared pinned message                                                                                                                                   |
| Snooze on a task whose asset is inaccessible                                    | 403 (same task-then-asset-then-access order as task edit)                                                                                                                                  |
| Snooze on a task of an archived asset                                           | Permitted via API (matches task edit/reschedule); unreachable from the dashboard, which excludes archived-asset tasks                                                                      |
| Snooze races a cycle transition                                                 | Conditional update on the head's current cycle; retried against fresh head state; 409 after retries exhausted                                                                              |
| Maintenance write gate is frozen (`maintenance_write_frozen`)                   | Snooze still works — the 503 gate guards maintenance-task storage, not notifications state                                                                                                 |
| Snooze accepted while the cycle's inbox row already exists (fired earlier)      | The existing inbox row is unchanged at snooze time (`readAt`/`createdAt` preserved); it is re-activated only at the re-fire on/after `snoozedUntil`                                        |
| Current cycle status is neither `pending` nor `fired` while the head is active  | 500 invariant violation — fails closed; nothing is written and no state changes                                                                                                            |
| New notification arrives while the user views the inbox                         | Appears on the next fetch/refresh; the inbox is not real-time                                                                                                                              |
| `limit`/`cursor` out of range or malformed                                      | 422 validation error                                                                                                                                                                       |
| Non-401 API error on the inbox (e.g. 500)                                       | Client shows an inbox-level error state with retry                                                                                                                                         |

## Telemetry

**Request telemetry:**

| Route                                                          | Operation                   |
| -------------------------------------------------------------- | --------------------------- |
| `GET /api/notifications`                                       | `ListNotifications`         |
| `POST /api/notifications/{notificationId}/read`                | `MarkNotificationRead`      |
| `POST /api/notifications/read-all`                             | `MarkAllNotificationsRead`  |
| `POST /api/assets/{assetId}/maintenance-tasks/{taskId}/snooze` | `SnoozeMaintenanceReminder` |

All four route patterns must be added to the operation-name mapping in `technicalTelemetry.ts`
and the Operation Name Mapping table in [telemetry.md](../cross-cutting/telemetry.md). The
scheduler, the sweep, and email delivery run outside the HTTP request path, so they are captured
as the domain events below, not request telemetry.

**Domain events consumed:** Notifications is a durable consumer of the existing enriched
`MaintenanceTaskCreated`, `MaintenanceTaskUpdated`, `MaintenanceTaskAdvanced`,
`MaintenanceTaskReconciled`, and `MaintenanceTaskDeleted` events
([maintenance-task.md](./maintenance-task.md)). Delivery is durable (its own queue), idempotent on
the event id, and order-tolerant — the same posture as [activity-history.md](./activity-history.md).
Those events must carry `nextDue` for this consumer. Maintenance-task `S5` adds
`MaintenanceTaskRescheduled` with the same delivery and payload requirements.

**Domain events produced:** Three events on a new dataset `pineapple_notification_domain_events`
(binding `NOTIFICATION_DOMAIN_TELEMETRY`). Telemetry handlers stay **thin selective readers**: they
record ids, enums, dates, and outcomes only — **never** the email address, asset name, or task
title, per the [telemetry.md](../cross-cutting/telemetry.md) PII anti-pattern. The user-facing
snapshot/title fields ride in the notification store and the queue message, not in Analytics
Engine.

### `MaintenanceReminderCreated` — per reminder fire (index: `owner_id`)

One per fire: the first fire of a cycle creates the inbox row; a snooze re-fire re-activates
that same row and emits another event carrying the same notification id.

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

### `MaintenanceReminderSnoozed` — on each accepted snooze (index: `owner_id`)

One per accepted snooze (per task/cycle). Emitted by the snooze use case through the
notification domain-event outbox; the mutating-request middleware relays it after the
successful `POST`, like other HTTP-path mutations.

| Field        | Name                    | Value                             |
| ------------ | ----------------------- | --------------------------------- |
| `indexes[0]` | —                       | `owner_id`                        |
| `blobs[0]`   | `event_type`            | `"MaintenanceReminderSnoozed"`    |
| `blobs[1]`   | `aggregate_type`        | `"Notification"`                  |
| `blobs[2]`   | `maintenance_task_id`   | Task UUID                         |
| `blobs[3]`   | `scheduled_reminder_id` | Scheduled-reminder (cycle) UUID   |
| `blobs[4]`   | `asset_id`              | Asset UUID                        |
| `blobs[5]`   | `owner_id`              | Owner UUID                        |
| `blobs[6]`   | `actor_id`              | UUID of the snoozing user         |
| `blobs[7]`   | `snoozed_until`         | Snooze expiry date (`YYYY-MM-DD`) |
| `blobs[8]`   | `schema_version`        | `"v1"`                            |
| `blobs[9]`   | `result`                | `"success"`                       |
| `doubles[0]` | `count`                 | Always `1`                        |
| `doubles[1]` | `event_time_ms`         | Event timestamp (ms since epoch)  |

### `ReminderEmailDispatched` — per aggregated email decision (index: `owner_id`)

One per aggregated send (per owner per sweep). Records the outcome and how many notifications the
email covered — this is the deliverability signal ADR-0012 requires.

| Field        | Name                 | Value                                                |
| ------------ | -------------------- | ---------------------------------------------------- |
| `indexes[0]` | —                    | `owner_id`                                           |
| `blobs[0]`   | `event_type`         | `"ReminderEmailDispatched"`                          |
| `blobs[1]`   | `aggregate_type`     | `"Notification"`                                     |
| `blobs[2]`   | `email_batch_id`     | Aggregated-send UUID (idempotency key)               |
| `blobs[3]`   | `owner_id`           | Owner UUID                                           |
| `blobs[4]`   | `schema_version`     | `"v1"`                                               |
| `blobs[5]`   | `result`             | `"sent"`, `"suppressed"`, `"failed"`, or `"unknown"` |
| `blobs[6]`   | `suppress_reason`    | `"no_contact_email"`, `"unverified"`, or `"none"`    |
| `doubles[0]` | `count`              | Always `1`                                           |
| `doubles[1]` | `event_time_ms`      | Event timestamp (ms since epoch)                     |
| `doubles[2]` | `notification_count` | Number of notifications covered by this email        |

## Implementation Requirements

- Populate `nextDue` and `taskRevision` on every enriched `MaintenanceTaskCreated`,
  `MaintenanceTaskUpdated`, `MaintenanceTaskAdvanced`, and `MaintenanceTaskReconciled` event
  payload where it is constructed in the application layer. The thin telemetry blobs stay PII-free
  and unchanged. `S5` must do the same for `MaintenanceTaskRescheduled`.
- Add two dedicated queues, each with its own DLQ: one inbound queue for the `MaintenanceTask*`
  notification consumer, and one outbound queue for aggregated email delivery. The split provides
  per-role isolation per [ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md):
  a stuck email send cannot block event ingestion.
- The email provider port returns one of `accepted`, `permanent_rejection`,
  `pre_acceptance_transient_failure`, or `unknown`. The Cloudflare adapter must distinguish a
  confirmed rejection before provider acceptance from a timeout/transport result whose acceptance
  is unknown; the former becomes `failed` and the latter becomes terminal `unknown`.
  `ReminderEmailDispatched` and its telemetry result union include `unknown` as a first-class
  outcome, while the stored claim transition still requires the token/lease CAS above.
- Every queue DLQ write uses the provider/queue message's stable `message.id` as its idempotency key
  (`queue`, `message.id` unique); it never generates a random persistence id as the dedupe key. If
  D1 is unavailable while persisting an exhausted message, the consumer throws so the queue retry
  remains available; once D1 accepts the row, later redelivery is an insert-or-ignore observation.
- `notification_email_outbox` is a separate relay state machine: `pending -> sending -> sent` on a
  confirmed `Queue.send`, with a claim token/lease and at most three pre-publication retries.
  Exhausted confirmed pre-publication failures become a durable DLQ row, terminal `failed` outbox
  state, terminal `failed` `email_batches` state, and exactly one `ReminderEmailDispatched`
  observation. A queue publication whose result is unknown leaves the claim to the lease reaper;
  the reaper records the relay failure durably, marks the outbox `failed`, marks the batch terminal
  `unknown`, and emits the same single terminal observation. The outbound consumer remains
  idempotent on `batchId` and ignores a message that arrives after a terminal batch state.
- If queue publication succeeds but the outbox `sending -> sent` update fails, the queue message is
  allowed to redeliver and the relay lease can later record a duplicate publication; the outbound
  consumer dedupes on `batchId`, so the provider-facing batch claim still permits only one logical
  send. If D1 cannot persist the terminal relay/DLQ row, the relay throws and retains the message for
  retry rather than acknowledging it. A pre-publication relay DLQ has no Cloudflare queue message
  id, so it uses stable `queue_message_id = "outbox:" + outboxId`; after publication it uses the
  actual queue `message.id`.
- Migration `0020_notification_heads_email_claims.sql` adds nullable `queue_message_id` to
  `notification_dead_letters`, backfills existing rows to deterministic `legacy:<id>` values, and
  adds a unique `(queue, queue_message_id)` index. It also rebuilds `notification_email_outbox` so
  its status check permits `pending | sending | sent | failed`, copies every existing row, preserves
  `batch_id` uniqueness and claimable indexes, and aborts on any count/key/index mismatch. Existing
  `sending` rows from the pre-claim schema are normalized to `pending` with a null token/lease and
  an immediately due retry; `sent` rows remain terminal. New queue
  consumers persist the actual stable Cloudflare `message.id`; the old generated `id` remains only
  the row identity.
- Add `notification_task_heads` and backfill it from existing `scheduled_reminders` in a new
  idempotent migration; existing heads start at revision `0` with the deterministic bootstrap
  marker, and the task row's current `nextDue` is authoritative for every active task. Before
  selecting the target, mark every pending historical cycle with a different `nextDue` as
  `superseded` so it cannot fire or block the pending-task unique index. A stale pending cycle is
  never silently dropped: its status transition is recorded before the target is selected. Ensure the
  `(taskId, task.nextDue)` cycle exists: reuse it when pending, reactivate it only when superseded,
  preserve it as fired when already fired, and never reactivate a canceled cycle. Historical cycles
  with a different `nextDue` never determine `currentNextDue`; canceled rows are preserved as
  terminal history and never deleted or reactivated. If an active task
  has no candidate row, create/reuse the target pending cycle and point the active head at it. For
  an active task whose target cycle is already canceled, preserve the terminal row and record a
  migration anomaly instead of creating a duplicate or silently reactivating it; the bootstrap
  migration must fail closed with the task id and the blocking validation must surface that anomaly
  for repair. For
  a task row that no longer exists, mark the head `deleted`, set `currentNextDue` to the greatest
  existing row's `nextDue` or `null` when no cycle exists, and cancel every non-fired cycle. Existing
  `scheduled_reminders.last_event_id` values beginning with `bootstrap:` become `kind = bootstrap`;
  all other existing messages/rows without a marker kind are `legacy`; a legacy delete source is
  marked terminal rather than being ranked below bootstrap. The migration must not rely
  on editing the already-applied `0011_bootstrap_scheduled_reminders.sql`.
- `notification_task_heads` is the sole authority for event ordering, task terminal deletion, and
  `(taskRevision, kind, lowercase(eventId))` acceptance. `scheduled_reminders.last_event_id` and
  `last_task_revision` are retained only as cycle provenance/debug snapshots and are never used to
  accept or reject an event. `notification_migration_anomalies` stores unresolved bootstrap repair
  rows (`task_id`, anomaly code, details, `resolved_at`); any unresolved row blocks deployment.
- Add `sweep_run_id` to `email_batches` and a unique index on `(sweep_run_id, owner_id)`. The sweep
  writes a single durable `notification_sweep_runs` row per derived `sweepRunId`; a rerun of the
  same scheduled timestamp reuses that row and cannot claim the same fired reminders into a second
  batch.
- `notification_sweep_runs` has `id` (the canonical `sweepRunId`), `cron_name`,
  `scheduled_time_epoch_ms`, `status` (`running` / `completed`), `created_at`, and `completed_at`,
  with a unique `(cron_name, scheduled_time_epoch_ms)`. `notification_sweep_items` has
  `(sweep_run_id, reminder_id)` as its primary key, `owner_id`, `claimed_at`, and `email_batch_id`;
  the sweep inserts/reuses one item per due reminder, creates the in-app notification, marks the
  reminder `fired`, and creates/links the owner batch and email outbox row in one D1 transaction.
  Concurrent invocations use `INSERT ... ON CONFLICT (cron_name, scheduled_time_epoch_ms) DO
NOTHING` and then read the existing run; a concurrent or retried invocation first reuses the
  existing run and items, so a crash cannot
  leave a fired reminder without its batch/outbox or claim it into a second batch.
- Add both queue bindings/consumers to `apps/api/wrangler.jsonc` and the matching idempotent queue
  creation entries to `.github/workflows/deploy.yml`, then regenerate the Worker binding types
  (`cf-typegen`) and give each producer binding its message type in `BindingOverrides` in
  `worker.ts` — wrangler types a queue as bare `Queue`. DLQs are durably drained into records; they
  are not just holding pens.
- Add the email-sending application port, the Cloudflare Email Sending infrastructure adapter, the
  Worker binding/`wrangler` config, and the sending domain's SPF/DKIM/DMARC in Cloudflare DNS.
  Domain and application code stay provider-agnostic.
- Snooze state is an **expand migration** adding a nullable `snoozed_until` date column to
  `scheduled_reminders` (per
  [schema-migrations.md](../cross-cutting/schema-migrations.md)); `null` means never snoozed, so
  no backfill is needed. Add a `SnoozeReminder` application use case whose D1 transition
  conditionally updates the current cycle (`status` `pending`→`pending` with a new
  `snoozedUntil`, or `fired`→`pending` re-arm) against `notification_task_heads.currentNextDue`,
  with the same bounded-retry concurrency as task mutations. The sweep's fire condition becomes
  `max(fireAt, snoozedUntil)`, and its fire write upsert-revives an existing inbox row on
  re-fire. The dashboard consumes this state through its queue-item `snoozedUntil` descriptor
  ([dashboard.md](./dashboard.md) `S6`), computed in the application layer.
- The snooze endpoint's Zod route spec lives with the other task-action schemas; regenerate
  `docs/reference/openapi.json` and `apps/web/src/api/schema.ts` per the standard contract-change
  flow, and add the `SnoozeMaintenanceReminder` operation mapping.
- Adding the scheduler and inbox introduces new tables such as `scheduled_reminders` and
  `notifications`, plus new branded ids such as `NotificationId` and a scheduled-reminder id.
  Update [data-model.md](../../reference/data-model.md), add the inbox and "verify an email to
  also get these by email" states to [`docs/web/FEATURES.md`](../../web/FEATURES.md), and
  regenerate the OpenAPI document from the new Zod route specs.
- **Outbox relay timing.** `notification_email_outbox` rows are written only by the reminder sweep
  (`D1ReminderSweepStore`) and are relayed to `REMINDER_EMAIL_QUEUE` only by the independent
  `D1NotificationEmailOutboxRepository` relay in the same `scheduled()` cron handler in
  `worker.ts` — there is no request-path relay for this outbox, unlike the activity and
  notification-event outboxes, which the mutating-request middleware relays immediately after a
  successful `POST`/`PATCH`/`DELETE`. The sweep and that relay are two unordered `waitUntil` calls
  with no sequencing between them, so a row the sweep writes on tick N is typically relayed on
  tick N+1, not the same tick — sweep-written rows already carry up to one cron period of latency
  today, consistent with [ADR-0013](../../decisions/0013-reminder-scheduler-via-cron-sweeps.md)'s
  reliability-over-precision framing. No request-path use case writes to
  `notification_email_outbox` today. If one starts to, add a matching relay to the request-path
  middleware (see the comment above `createMutatingRequestOutboxRelayMiddleware`'s call site in
  `worker.ts`) — otherwise those rows would silently wait a full cron period longer than the
  sweep-written ones already do, with no request-path signal that anything is missing. See issue
  #70.

## Out of Scope

- **Notification types other than `maintenance_due_soon`** — the inbox, scheduler, and event shape
  are built to extend (registration renewals, inspections), but v1 ships the one due-soon reminder
- **Configurable or per-task lead times** — 7 days is fixed for v1 (a consumer-owned policy per
  ADR-0010); per-user/per-task lead-time preferences are future work
- **Preferred local send hour** — v1 sends on the first sweep on or after the effective fire date;
  a preferred local send hour such as 8am needs a stored user timezone and is future work
- **Overdue escalation / repeat reminders** — v1 sends a single reminder per due-cycle; on-due and
  overdue re-nudges are future work. A snooze re-fire is user-initiated, not an automatic
  re-nudge, and does not change this
- **A scheduled daily/weekly digest across sweeps** — v1 aggregates per sweep only; a fixed-time
  summary email is future work
- **Auto-resolving a notification when its task is later completed** — completing a task does not
  retroactively clear or mark read an already-created reminder in v1 (a superseding
  `MaintenanceTaskAdvanced` only prevents the _old cycle's_ reminder from firing; it does not touch
  a reminder already fired). `S5` rescheduling follows the same rule when it ships.
- **Per-entry dismiss/delete or muting** of inbox notifications — v1 supports read /
  mark-all-read, plus the task-level reminder snooze above; entry-level actions are tracked in
  [#186](https://github.com/snaveevans/pineapple/issues/186) and are expected to carry their own
  state on the notification row rather than reuse reminder `snoozedUntil` (a snooze changes when
  a reminder fires; a mute would only hide one inbox entry)
- **Auto-pruning / expiring notifications** — v1 keeps a durable inbox with no auto-deletion; a
  retention window (prune read/old entries) is future work
- **Channels other than in-app + email** — no SMS, push, or webhooks
- **Real-time/live inbox updates** — the inbox refreshes on fetch, not via push
- **Retroactively emailing suppressed past reminders** after a later verification
- **Cancel-on-archive** — existing scheduled reminders for archived assets fire in v1; archive
  cancellation and the worked-out cascade are parked in [archive-asset.md](../backlog/archive-asset.md).
- **The contact-email value, its endpoints, and the verification flow** — owned by
  [user-profile.md](./user-profile.md) and [email-verification.md](./email-verification.md)
- **Cross-user or team-wide notifications** — single-owner scope in v1

## Future Considerations

- Team/delegate notifications. v1 records `actorId` (`"system"`) separately from `ownerId` for
  future attribution, but does not display an actor or support cross-user inboxes.
- Add provider-level idempotency keyed by `emailBatchId` if the selected email provider offers it;
  until then, the documented v1 crash-after-accept edge remains the only path to a physical
  duplicate, and no application retry intentionally repeats a claimed batch.
