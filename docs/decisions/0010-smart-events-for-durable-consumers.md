# Smart Events for Durable Consumers

- Status: accepted
- Date: 2026-06-22

## Context and Problem Statement

Aggregates raise domain events that are published to an in-process event bus and
consumed synchronously by infrastructure handlers (ADR-0002, ADR-0005). Today those
events are **thin**: they carry identifiers, types, and dates, but not the descriptive
state a consumer would need to act without reading the source back, and not the
conclusions the producing layer already computed. The only consumers so far are
telemetry handlers, which tolerate thin events because they deliberately record IDs and
enums and nothing else.

The Activity History feature (`docs/specs/features/activity-history.md`) introduces a
different kind of consumer: a **durable projection** that must turn each event into a
self-contained, append-only record of what the user did. A thin event forces that
consumer into one of two bad positions:

1. **Re-read D1** to fetch the descriptive state (asset name, task/record title). This
   adds reads to the event-handling path and **fails outright** for hard-deleted
   aggregates — a removed maintenance task (`DELETE FROM maintenance_tasks`) no longer
   exists to read when its "removed" entry is written.
2. **Re-derive conclusions** the domain already computed (e.g. whether a maintenance
   record advanced a task, a task's resulting `nextDue`), duplicating business logic in
   the consumer.

ADR-0009 already answered the analogous question at the **HTTP boundary**: computed
fields belong in API read models; clients render them and do not re-derive. We have the
same problem one boundary inward — at the **event bus** — and we should answer it the
same way.

The user's shorthand for the answer is **"Smart Events."** In the literature this is
**Event-Carried State Transfer** (ECST) — events fat enough that a consumer can build
its own read model without calling back to the producer — with the additional rule that
the event also carries the **derived conclusions** the producing layer owns.

## Decision Drivers

- **Consistency with ADR-0009.** Business conclusions are computed once, in the layer
  that owns them; consumers render/record, they do not re-derive. This should hold at
  every boundary, not just HTTP.
- **Durable consumers need an as-of snapshot.** A projection/audit/History record must
  capture what was true at the moment the action happened, and must survive later
  mutation or deletion of the source.
- **Hard-deleted aggregates cannot be read back.** For those, the event is the _only_
  place the state can live.
- **Cost and latency.** Re-reading D1 from each consumer adds reads on the
  event-handling path; for a durable consumer that runs on every mutation, this is
  avoidable work.
- **Keep the telemetry PII boundary intact.** Richer events must not cause user-supplied
  strings to leak into Analytics Engine (`telemetry.md` anti-patterns).
- **Don't over-commit.** The bus is in-process and synchronous today, so producers
  should not carry speculative state that no consumer needs.

## Considered Options

- **A. Thin events; consumers re-read or re-derive** (status quo / "Event Notification")
- **B. Smart Events scoped to durable consumers** — events carry the state and derived
  conclusions that durable/async consumers need; thin selective consumers (telemetry)
  simply ignore the fields they don't use
- **C. Full ECST as a project-wide default** — every event carries complete state and
  conclusions regardless of whether any consumer needs them

## Decision Outcome

Chosen option: **B — Smart Events scoped to durable consumers.**

A domain event carries:

1. **State** — the descriptive fields a durable consumer needs to build a self-contained
   record without reading the source (e.g. the asset's name and type, a task or record
   title), in addition to the identifiers and dates it already carries.
2. **Derived conclusions** — the conclusions the producing layer already computed as part
   of the operation, so no consumer re-derives business logic (e.g. a task's resulting
   `nextDue` after an advance, or the fact that a maintenance record advanced a task).

This is ADR-0009's principle applied to the event bus. We **scope** it to where it pays
off: events grow to serve real durable consumers, not speculatively, and telemetry
remains a **thin, selective reader** that records only non-PII IDs and enums.

### Boundary: what an event carries vs. what it does not

| Concern                                  | On the event?   | Examples                                                                                       |
| ---------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Identifiers and domain dates             | **Yes**         | `assetId`, `ownerId`, `actorId`, `occurredAt`, `performedAt`, `nextDue`                        |
| Descriptive state a consumer must record | **Yes**         | asset `name` + `type`, task/record `title`                                                     |
| Producer-owned derived conclusions       | **Yes**         | resulting `nextDue` after `advance`; on-time vs. overdue; "this record advanced task X"        |
| Consumer-owned conclusions               | **No**          | gamification points/badges, reminder lead-time policy, notification channel/prefs              |
| Presentation copy / formatting           | **No**          | `"Overdue · 3 days"`, localized labels — same line ADR-0009 draws; consumers format            |
| What a _specific sink_ may persist       | Consumer's call | telemetry must not write `name`/`title` to Analytics Engine even though the event carries them |

### Producer-owned vs. consumer-owned conclusions

Define an event by the **producer's** account of what happened — the facts it knows and the
conclusions _it_ owns — not by enumerating what each consumer wants. That keeps the payload
bounded by the producing domain (rather than growing into a union of consumer wishlists) and
keeps the dependency arrow pointing from consumers → event, never back.

A **producer-owned** conclusion is one the producing domain computes as part of the
operation — a task's resulting `nextDue`, or whether a completion was on-time vs. overdue.
Those go on the event, and every consumer reads the same authoritative value.

A **consumer-owned** conclusion belongs to a consumer's own domain and must **not** ride on
the event. The clearest anti-example is a gamification consumer awarding points: computing
"earned 10 points" in the maintenance use case and stamping it on the event would pull the
trophy domain into the producer — point-value changes would redeploy the producer, and
History and telemetry would carry irrelevant fields. Instead the event carries the **facts**
(task completed, on-time vs. overdue, asset type, `performedAt`) and the trophy consumer
derives points from them with its own rules. Rule of thumb: **carry the facts and the
producer's conclusions; let each consumer draw its own.**

### As-of semantics

A conclusion baked into an event is **frozen at event time**. That is exactly what a
durable consumer wants — History should record the conclusion that was true _then_, even
if the rule changes later. A **live** read model still recomputes against current context
(e.g. urgency relative to "today"). So: ship **intrinsic** conclusions freely; treat
**time-relative** conclusions as a snapshot meaningful to durable consumers, never as a
substitute for live recomputation.

### Consumer taxonomy

Not all consumers are alike; the shape determines both what an event must carry and how
reliably it must be delivered:

- **Thin selective reader** (e.g. telemetry) — records a few non-PII fields; best-effort
  delivery is acceptable by design.
- **Durable projection** (e.g. History, a trophy/points ledger) — turns each event into
  durable state; a dropped event is a missing record users can notice, so it needs
  at-least-once delivery and idempotent handling.
- **Durable scheduler** (e.g. a notification/reminder engine) — additionally schedules
  future work (fire a reminder before `nextDue`) and keeps mutable, cancelable state keyed
  by the source entity, reacting to later events (reschedule on a new completion, cancel on
  delete/archive).

This ADR governs event **payload**. The **delivery/transport** guarantees each shape needs —
best-effort in-process vs. at-least-once via an outbox or a durable queue, plus a scheduling
primitive for the scheduler shape — are a separate decision: see
[ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md).
The in-process best-effort `InMemoryEventBus` is adequate for thin readers and the initial
History projection, but durable projections and schedulers will require at-least-once
delivery.

### Where enrichment is assembled

An aggregate may only put its **own** state and conclusions on the events it raises. When
an event needs **cross-aggregate** state — e.g. the asset's name on a maintenance event,
which the maintenance aggregate does not hold — that field is supplied by the
**application layer** (the use case, which already loads the asset), not by having an
aggregate reach into another aggregate's repository. This keeps the enrichment within the
ADR-0003 dependency rules.

### Positive Consequences

- One authoritative conclusion across HTTP responses and events; no consumer re-derives
  business logic. ADR-0009 now holds at both boundaries.
- Durable projections (History) become pure event→record writes: no read-back, and
  correct even when the source has been hard-deleted.
- Removes per-event D1 reads from the handling path.
- Positions durable consumers to move off the synchronous in-process bus later (Queues,
  Workflows, Durable Objects) without distributed callbacks.

### Negative Consequences

- Events become a **wider contract**. Producers maintain fields that exist for consumers,
  and event payloads may need versioning as they grow.
- Producers must **have the state at publish time**. Cross-aggregate fields must be
  threaded through the application layer, a small added coupling between the use case and
  what its consumers record.
- **Ongoing discipline** is required to keep presentation out of events and to keep PII
  out of telemetry sinks. The safeguard moved from "the event is thin" to "each consumer
  selects what it persists."

## Pros and Cons of the Options

### A. Thin events; consumers re-read or re-derive

- ✅ Good, because event payloads stay minimal and producers carry nothing for consumers.
- ❌ Bad, because durable consumers must re-read the source — impossible for hard-deleted
  aggregates.
- ❌ Bad, because conclusions get re-derived in consumers, duplicating domain logic and
  contradicting ADR-0009.
- ❌ Bad, because it adds D1 reads on the event-handling path.

### B. Smart Events scoped to durable consumers _(chosen)_

- ✅ Good, because it extends an already-accepted principle (ADR-0009) to the event bus.
- ✅ Good, because durable projections become self-contained and survive source deletion.
- ✅ Good, because it grows event contracts only where a real consumer needs it.
- ✅ Good, because it leaves the future door open for async consumers.
- ❌ Bad, because event contracts widen and producers thread cross-aggregate state.

### C. Full ECST as a project-wide default

- ✅ Good, because it is maximally consistent — every event has the same fat shape.
- ❌ Bad, because it commits producers to wide contracts speculatively, with no consumer
  to justify the fields.
- ❌ Bad, because the in-process synchronous bus does not yet need the decoupling that
  would justify the cost.

## Relationship to existing decisions

- **Extends [ADR-0009](0009-computed-fields-belong-in-api-read-models.md)** — the
  "compute once, render don't re-derive" rule now applies at the event boundary too.
- **Builds on [ADR-0002](0002-use-tactical-ddd-patterns-for-the-domain-layer.md)** —
  events remain domain objects raised by aggregates; cross-aggregate enrichment is
  assembled in the application layer per
  [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md), not inside an
  aggregate.
- **Respects `docs/specs/cross-cutting/telemetry.md`** — the PII anti-pattern is
  unchanged; telemetry handlers stay thin selective readers.
- **First applied by** `docs/specs/features/activity-history.md`, whose durable
  activity-log consumer is the motivating case.
