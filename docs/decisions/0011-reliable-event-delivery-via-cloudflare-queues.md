# Reliable Event Delivery to Durable Consumers via Cloudflare Queues

- Status: accepted
- Date: 2026-06-22

## Context and Problem Statement

[ADR-0010](0010-smart-events-for-durable-consumers.md) decided the event **payload**
(Smart Events) and explicitly deferred the **delivery/transport** decision. This ADR makes
it.

Today domain events flow through the `InMemoryEventBus`: synchronous, in-process,
**best-effort** — `publish()` awaits every handler within the originating request, and a
handler error is logged and swallowed (`telemetry.md` failure policy). That is correct for
telemetry (fire-and-forget) and tolerable for the _initial_ History projection. It does not
hold up for the durable consumers ADR-0010's taxonomy names:

- **History** (durable projection) — a dropped event is a missing record.
- **Trophy / gamification** (durable projection) — a dropped event is lost points or a
  broken streak; users notice.
- **Notifications / reminders** (durable scheduler) — a dropped event is a maintenance
  reminder that never fires: the core value proposition failing silently.

Two problems with the status quo for these: (1) **delivery is best-effort** — a swallowed
failure is a permanent gap; (2) **fan-out is synchronous** — the user's "complete task"
request blocks on, and is coupled to the health of, every consumer. We need reliable,
**at-least-once** delivery that is decoupled from the request and isolates consumers from
each other.

## Decision Drivers

- **At-least-once delivery** to durable consumers; no silent gaps.
- **Decouple** consumer processing from the request path (latency and failure isolation).
- **Isolation between consumers** — a poison message for Trophy must not stall History.
- **Idempotency** — at-least-once implies redelivery; consumers must dedupe.
- **Keep telemetry cheap** — best-effort and in-process; don't pay a queue for fire-and-forget.
- **Workers-native, minimal new infra**, and consistent with the layering of
  [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md).
- **Preserve Smart Events** — the enriched payload rides in the message so a consumer needs
  no read-back (ADR-0010). Cloudflare's 128 KB message limit is ample for these payloads.

## Considered Options

- **A. Keep the in-process best-effort bus.**
- **B. In-process bus + transactional outbox + relay**, but consumers still run in-process.
- **C. Cloudflare Queues — one queue per durable consumer (fan-out by producing to each),
  idempotent consumers, per-queue DLQ.** (chosen)
  - sub-variant: **one shared queue + a dispatcher** consumer.
- **D. Durable Objects or Workflows as the event backbone.**

## Decision Outcome

Chosen: **C — Cloudflare Queues for at-least-once delivery to durable consumers**, with the
following shape. Telemetry stays on the in-process best-effort path; only durable consumers
move onto Queues.

### Topology: one queue per durable consumer

Cloudflare Queues binds **one consumer Worker per queue** — there is no native pub/sub
fan-out from a single queue to multiple consumer groups. So fan-out is done by the producer
**sending the event to each consumer's queue**.

Per-consumer queues (not a shared queue + dispatcher) because each consumer then gets
**independent** batching, retry policy, DLQ, and failure isolation — a stuck Trophy message
never blocks History, and each DLQ is inspected on its own. The shared-queue+dispatcher
variant is rejected: it recouples the consumers we just decoupled and forces one retry/DLQ
policy and one ack decision across all of them.

### Producer integrity: end-to-end, not just in-queue

Queues guarantees at-least-once **only once a message is enqueued** — if the domain state
commits to D1 but the enqueue then fails (or the Worker dies between them), the event is
lost. Closing that commit-vs-enqueue gap, so delivery is **end-to-end** at-least-once, is a
**producer-side requirement** of this decision, adopted from the start (no best-effort
interim). The mechanism that satisfies it (a transactional outbox) is specified in the
implementing feature spec (`docs/specs/features/activity-history.md`), not here — the ADR
records the decision; the spec carries the mechanism.

### Consumer idempotency

At-least-once means a consumer will occasionally see the same message twice, so every consumer
**must be idempotent**, keyed on the stable event id each message carries (ADR-0010 already
calls for one). _How_ a consumer dedupes is an implementation concern for that consumer's spec,
not part of this decision.

### Retry, poison handling, ordering

- Transient failures retry with backoff; permanent failures (an unprocessable/malformed
  event) go straight to the consumer's **DLQ** rather than burning retries.
- **A DLQ must be durably drained, not just a holding pen.** DLQs share the 4–14 day
  retention, so an unattended DLQ message silently expires — reintroducing the very gap this
  ADR exists to prevent. **Minimum-viable policy (now):** a DLQ consumer persists each failed
  message durably and logs it; replay is manual and idempotent-safe. Automated
  alerting and one-click replay are **deferred**. A single **uniform** retry/DLQ policy
  applies across consumers for now; per-consumer tuning comes when Notifications lands.
- **Ordering is not guaranteed** (batches + retries can reorder). Consumers must tolerate it:
  History orders by `occurredAt` (not arrival); the reminder consumer resolves
  schedule-vs-cancel by event time/version, not receipt order.

### Scheduling is not delivery

Queues' delivery delay caps at **12 hours**, so it is only for retry backoff / short defers —
it **cannot** schedule a reminder months out. The notification scheduler ("fire just before
`nextDue`") is a **separate primitive** — Cron Triggers sweeping due reminders, or Durable
Object alarms — and a separate ADR/spec. This ADR covers delivery reliability only.

### Layering

The `EventBus` port (application layer) is unchanged. Publishing to the durable-consumer
queues and running the in-process telemetry handlers are **infrastructure**, wired in the
composition root; the queue consumers are infrastructure handlers too. Domain and application
stay unaware of Queues (ADR-0003). Binding names, batch sizes, retry counts, and DLQ wiring
are implementation config — not part of this decision.

### Positive Consequences

- Durable consumers get at-least-once delivery; the request path no longer blocks on or fails
  with them.
- Per-consumer isolation: independent retries, DLQs, and back-pressure.
- Smart Event payloads ride in the message — consumers still need no read-back (ADR-0010).
- End-to-end at-least-once closes the commit-vs-enqueue gap — not just delivery once enqueued.

### Negative Consequences

- More moving parts: a durable producer-side delivery path (mechanism in the feature spec),
  three queues, three DLQs.
- Consumers must be **idempotent** and **order-tolerant** — real design constraints, not
  optional.
- A queued consumer cannot signal failure back to the user synchronously; surfacing
  consumer-side failures (e.g. a reminder that never scheduled) needs DLQ monitoring.
- Asynchrony loses TypeScript's compile-time coupling between producer and consumer; event
  payloads now need versioning discipline (additive changes + a version field).

## Pros and Cons of the Options

### A. In-process best-effort bus (status quo)

- ✅ Simplest; zero new infra; ordered, synchronous.
- ❌ Best-effort — a swallowed failure is a permanent gap (unacceptable for reminders/points).
- ❌ Couples request latency and success to every consumer.

### B. In-process bus + outbox, consumers still in-process

- ✅ Closes the producer gap; no queue product.
- ❌ Still couples consumer execution to the request; no isolation or independent retry/DLQ.
- ❌ Re-implements retry/back-pressure/DLQ by hand.

### C. Cloudflare Queues, per-consumer queues + outbox _(chosen)_

- ✅ At-least-once, decoupled, isolated per consumer; Workers-native.
- ✅ Built-in retries, DLQ, batching, back-pressure.
- ❌ More infra; demands idempotent, order-tolerant consumers; async failure surfacing.

### D. Durable Objects / Workflows as the backbone

- ✅ DO alarms are excellent for the _scheduling_ half; Workflows give durable multi-step.
- ❌ Heavier than needed for fan-out delivery; DO-as-bus means hand-built routing/back-pressure.
- ➡️ Complementary, not competing: a DO alarm or Cron is the likely **scheduler** behind the
  notifications queue — a separate decision.

## Relationship to existing decisions

- **Implements the transport deferred by [ADR-0010](0010-smart-events-for-durable-consumers.md)** —
  Smart Events shapes the payload; this shapes its delivery. The two are complementary.
- **Consistent with [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md)** —
  the `EventBus` port is unchanged; Queues live in infrastructure + composition.
- **Builds on [ADR-0005](0005-repository-contract.md) / D1** — the producer-side integrity
  mechanism (detailed in the feature spec) relies on D1's transactional guarantees.
- **`docs/specs/cross-cutting/telemetry.md` is unaffected** — telemetry stays in-process and
  best-effort; it is not routed through Queues.
- **Reconciled in `docs/specs/features/activity-history.md`** — History's delivery is durable
  (end-to-end at-least-once) from the start; the spec replaces its earlier "best-effort
  capture" note and is where the outbox mechanism is specified.

## Sub-decisions

- **Producer integrity — RESOLVED:** end-to-end at-least-once from the start, no best-effort
  interim. The outbox mechanism is specified in the feature spec, not this ADR.
- **Dedup — RESOLVED:** consumers are idempotent, deduping on the event id so redelivery is a
  no-op; the concrete mechanism lives in each consumer's spec (see the activity-history spec).
- **Retry/DLQ policy — RESOLVED (minimum viable):** one uniform policy across consumers;
  transient failures retry with backoff, permanent failures DLQ immediately; each DLQ is
  durably drained (failed messages persisted + logged) so nothing expires unattended;
  replay is manual and idempotent-safe. Automated alerting, one-click replay, and
  per-consumer tuning are **deferred** (expand when Notifications lands). Exact retry
  counts and backoff are tuned at implementation.
