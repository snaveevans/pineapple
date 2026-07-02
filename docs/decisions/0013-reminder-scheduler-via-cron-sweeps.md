# Reminder Scheduler via Cron Sweeps

- Status: accepted
- Date: 2026-07-02

## Context and Problem Statement

Reminders and notifications need a scheduler: something must wake near a maintenance
task's `nextDue`, decide whether a reminder should be sent, and hand the send to the
email channel chosen in [ADR-0012](0012-transactional-email-via-cloudflare-email-sending.md).
[ADR-0010](0010-smart-events-for-durable-consumers.md) names this shape a **durable
scheduler**, and [ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md)
explicitly separates long-horizon scheduling from queue delivery because Queues are not a
months-out reminder primitive.

The scheduler choice has architectural weight because it determines whether reminder state
is centralized in D1 and periodically swept, or distributed into many stateful schedulers.
Both shapes can be correct. Pineapple's current product shape is still small: a two-person
field-operations app with low reminder volume, date-oriented due values, and no current
need for second-level wake precision. The expected failure mode is not "a reminder is sent
a few minutes late"; it is "a reminder is never sent" or "a deleted/rescheduled task still
notifies." That pushes the design toward durable state, idempotency, and observability, but
not necessarily toward per-entity actors yet.

This decision records the scheduler primitive only. The reminder table shape, due-window
query, idempotency keys, exact sweep cadence, email template, retry policy, and user-facing
preferences belong in the notifications/reminders feature spec.

## Decision Drivers

- **Reliability over precision.** Reminders must not silently disappear, but minute-level
  timing is acceptable for maintenance due dates.
- **Operational simplicity.** Prefer the smallest new infrastructure surface that can be
  inspected, tested, and repaired by a small team.
- **Scale fit.** Optimize for the current two-person use case while leaving a clear path if
  reminder entities grow enough to make sweeps inefficient.
- **Workers-native implementation.** Stay within the Cloudflare Workers/D1/Queues platform
  selected by [ADR-0006](0006-deployment-platform.md) and [ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md).
- **Idempotency and cancellation.** The scheduler must tolerate at-least-once event
  delivery, retries, stale messages, task advancement, and task deletion/archive.
- **Layering.** Domain and application rules remain independent of Cloudflare scheduler
  primitives; infrastructure owns the wake-up mechanism.
- **Reversibility.** If load, precision needs, or coordination complexity increases, the
  scheduler primitive should be replaceable without changing the event payload contract.

## Considered Options

- **A. Cron Trigger sweep over durable reminder state in D1.** _(chosen)_
- **B. Durable Object alarms for per-entity or per-user scheduling.**
- **C. Use Queues delivery delay or Workflow sleeps as the scheduler.**
- **D. In-process timers or best-effort request-time scheduling.**

## Decision Outcome

Chosen option: **A. Cron Trigger sweep over durable reminder state in D1.**

The notifications consumer will persist the durable scheduling state needed to know what is
due, canceled, already sent, or rescheduled. A Cloudflare Cron Trigger will periodically
wake the API Worker, sweep due reminder state, and hand send work to the email-sending
port. The exact persistence schema, query windows, batching, and send mechanics are
feature-spec and implementation details.

This wins on the current drivers because Pineapple needs reliable, inspectable reminder
execution more than exact per-entity wake-ups. D1 is already the system of record, the API
Worker already has scheduled-handler infrastructure, and a sweep keeps reminder state easy
to audit and repair. The accepted trade-off is that every wake-up scans for due work and
reminder delivery is bounded by sweep cadence rather than an exact alarm timestamp.

### Revisit Trigger

Reconsider Durable Object alarms if Pineapple has many more users or enough reminder
entities that periodic D1 sweeps become expensive, noisy, or operationally awkward; if
reminders need fine-grained wake precision; or if per-entity coordination becomes complex
enough that a stateful actor is simpler than a central sweep.

### Layering

The scheduler primitive is infrastructure. Domain events continue to carry the producer
facts and conclusions described by [ADR-0010](0010-smart-events-for-durable-consumers.md),
and durable delivery still follows [ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md).
Domain and application code should not depend on Cron Trigger APIs, Durable Object alarms,
or Workflow APIs. The notifications/reminders spec owns the application port boundaries and
the concrete infrastructure adapters.

### Positive Consequences

- Adds no new stateful runtime beyond the Worker, D1, Queues, and email binding already in
  the architecture.
- Keeps reminder state centralized, queryable, and repairable in D1.
- Fits date-oriented maintenance reminders where "near due time" matters more than exact
  second-level scheduling.
- Provides a simple migration path: Smart Events and durable reminder rows can later feed
  Durable Object alarms if scale or precision changes.
- Local and CI testing can exercise a single scheduled sweep path without constructing a
  fleet of per-entity actors.

### Negative Consequences

- Reminder timing is only as precise as the sweep cadence and due-window logic.
- Sweeps do some recurring work even when no reminders are due.
- The due query, locking/idempotency, and batching must be designed carefully to avoid
  duplicate sends or missed reminders under retries and overlapping invocations.
- If reminder volume grows substantially, D1-centered sweeping may become less efficient
  than sharded or per-entity scheduling.
- Durable Object alarms remain a future migration path, not a capability available from the
  first reminder implementation.

---

## Pros and Cons of the Options

### A. Cron Trigger sweep over durable reminder state in D1

- Good, because it is the smallest Workers-native scheduler that satisfies the current
  reliability need.
- Good, because reminder state stays centralized and inspectable in D1.
- Good, because it matches date-based maintenance reminders where a cadence-bound send is
  acceptable.
- Good, because it can reuse the existing Worker scheduled-handler surface.
- Bad, because it trades exact wake precision for periodic polling.
- Bad, because scaling is tied to due-query efficiency and batching discipline.

### B. Durable Object alarms for per-entity or per-user scheduling

- Good, because each object can schedule future work directly and coordinate mutable state
  for that object.
- Good, because it is a strong fit for high-cardinality reminders, exact wake-ups, or
  complex per-entity cancel/reschedule behavior.
- Bad, because it adds a new stateful runtime, bindings, migrations, alarm behavior, and
  testing surface before Pineapple has the scale or precision needs to justify it.
- Bad, because modeling the right object boundary now would be speculative: per task, per
  asset, per user, or some shard key each optimize different future loads.

### C. Use Queues delivery delay or Workflow sleeps as the scheduler

- Good, because it keeps scheduling attached to the asynchronous delivery pipeline.
- Good, because Workflows can model long-running multi-step processes if reminder behavior
  later becomes more orchestration-heavy.
- Bad, because ADR-0011 already rejected Queues as a months-out reminder scheduler; queue
  delay is for short defers and retry backoff, not long-horizon maintenance reminders.
- Bad, because Workflows would add a larger orchestration primitive than the current product
  needs for simple due-date reminders.

### D. In-process timers or best-effort request-time scheduling

- Good, because it has almost no infrastructure cost.
- Bad, because Workers are not long-lived processes that can hold reliable timers across
  evictions, deploys, or idle periods.
- Bad, because it recreates the silent-gap problem ADR-0011 exists to remove from durable
  consumers.
