# Transactional Email via Cloudflare Email Sending

- Status: accepted
- Date: 2026-07-01

## Context and Problem Statement

"Reminders & notifications" is a near-term roadmap item — service-due, inspection,
and registration-renewal reminders. In the consumer taxonomy of
[ADR-0010](0010-smart-events-for-durable-consumers.md) this is the **durable
scheduler**: it wakes just before a task's `nextDue` and must tell the user. That
"tell the user" step needs an outbound channel, and for a two-person field team with
no app-install or push infrastructure, the channel is **email**. The app has no
outbound-email capability today; this decision picks the service that provides it.

The choice is narrowly scoped to **outbound transactional sending**. It is _not_:

- inbound email **routing/receiving** — there is no receive use case;
- the reminder **scheduler** primitive ("fire just before `nextDue`") — ADR-0011
  already flagged that as a separate primitive and a separate decision (Cron Triggers
  or Durable Object alarms);
- the **queue transport** that carries the domain event to the notifications consumer
  ([ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md)).

This ADR only decides **who puts the email on the wire** once the consumer has decided
to send one.

There is one force worth naming up front. [ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md)
exists so that a reminder is never dropped _in transit_ — best-effort delivery was
rejected precisely because "a maintenance reminder that never fires" is the core value
proposition failing silently. That same failure mode lives one hop further out: an email
that hard-bounces or lands in spam is a reminder that silently didn't arrive. So the
provider choice is partly an at-least-once-delivery concern extended to the last hop —
**deliverability**, not just API ergonomics.

Two constraints make the stakes lower than they first appear:

- **Volume is trivial.** Two users, a handful of reminders a week. Every candidate's
  free or entry tier covers this many times over, so raw price and scale ceilings do
  not differentiate the options.
- **The send will sit behind an application port.** Per
  [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md) and
  [ADR-0005](0005-repository-contract.md), sending email is a port the application layer
  depends on and infrastructure implements. The concrete provider is a swappable adapter,
  so this decision is **reversible** at adapter cost, not application-rewrite cost.

## Decision Drivers

- **Platform consistency (ADR-0006).** We are already all-in on Cloudflare — Workers,
  D1, Queues. One vendor, one bill, one dashboard, one `wrangler` local-dev story has
  real operational value for a two-person team.
- **Marginal cost.** We already pay the Workers Paid plan for Queues. The strongly
  preferred outcome adds email capability without a _new_ vendor bill on top of the plan
  we already carry.
- **Deliverability for a must-not-fail channel.** A reminder in spam is the same silent
  failure ADR-0011 was written to prevent — one hop later. The provider's sending
  reputation and authentication story matter.
- **Low volume.** Two people; every free/entry tier covers it. Price and scale do **not**
  differentiate — so a driver that would normally favor "cheapest at scale" carries
  almost no weight here.
- **Operational simplicity.** SPF/DKIM/DMARC setup and ongoing account management. If the
  sending domain is managed in Cloudflare DNS, the authentication records can be
  provisioned in the same platform rather than hand-copied to a third party.
- **Reversibility.** The send is behind a port; the provider is an adapter. This lowers
  the stakes of every option and, in particular, makes it acceptable to pick a _less
  proven_ service and swap if it disappoints.
- **Maturity.** Willingness to run a production channel on an **open-beta** service versus
  a long-GA specialist.

## Considered Options

- **A. Cloudflare Email Sending** (open beta) — first-party sending, native to the stack.
  _(chosen)_
- **B. Resend** — developer-focused transactional email API.
- **C. Postmark** — transactional-email specialist known for deliverability.
- **D. Amazon SES** — commodity, high-scale email from AWS.

Named but not weighed as first-class options: incumbent HTTP APIs (SendGrid, Mailgun,
Brevo) carry the same "new external vendor" cost as Resend/Postmark with heavier APIs and
no advantage at this scale; and self-hosting SMTP / a mail server is a non-starter — the
Workers runtime cannot run a mail server, and self-hosted deliverability is an ongoing
operations burden out of all proportion to two users. See the final subsection under Pros
and Cons.

## Decision Outcome

Chosen option: **A — Cloudflare Email Sending.**

It wins the drivers that actually differentiate the options _here_: **platform
consistency**, **marginal cost**, and **operational simplicity**. Email becomes another
binding in the same worker configuration that already holds D1 and Queues — no new vendor
to onboard, no separate dashboard or bill, the same `wrangler` local-dev and observability
story, and (with the domain in Cloudflare DNS) authentication records provisioned in place.
That is the same single-platform logic ADR-0006 already accepted, extended one capability
further.

The drivers where the specialists lead — **deliverability track record** and **maturity** —
are the honest cost of this choice, and both are de-risked rather than dismissed:

- **Volume is trivial**, so we are not stress-testing throughput, suppression at scale, or
  per-message price.
- **The send is behind a port**, so if deliverability proves weak in practice we replace
  the adapter (a bounded change) rather than living with it. The recommended options B–D
  do not go away by choosing A; they remain the fallback the port exists to enable.

### Deliverability is the risk to watch, not throughput

Because this is a reminders channel, the failure that matters is _silent non-arrival_, not
capacity. The team should treat deliverability as the acceptance criterion for keeping this
adapter: if reminders land in spam or bounce without visibility, that is the trigger to
swap to a specialist (Postmark being the deliverability-first choice). Making that
observable — bounce/complaint signals, a way to know a reminder was accepted — is a
**mechanism** concern for the implementing spec, not this ADR; but the _requirement_ that
non-arrival be detectable is part of accepting an open-beta provider for this channel.

### Layering

The application layer depends on an email-sending **port**; the Cloudflare Email Sending
adapter is **infrastructure**, wired in the composition root, exactly as repositories and
the queue producer are (ADR-0003/0005). Domain and application stay unaware of the provider.
The port interface, the binding and `wrangler` configuration, the DNS/authentication setup,
and _which_ consumer invokes the send all belong to the **notifications/reminders feature
spec** (not yet written — see Follow-ups), not to this record.

### Positive Consequences

- Email is one more binding alongside D1 and Queues — no new vendor account, API-key
  secret, dashboard, or bill beyond the Workers Paid plan already carried for Queues.
- With the sending domain in Cloudflare DNS, SPF/DKIM/DMARC can be provisioned in-platform
  rather than transcribed into a third party.
- One consistent local-development (`wrangler`), billing, and observability surface across
  the whole backend.
- The single-platform posture of ADR-0006 is preserved; no second cloud vendor is
  introduced for one small capability.

### Negative Consequences

- **We run a production channel on an open beta.** SLA, stability, and feature
  completeness are less proven than a long-GA provider; if Cloudflare changes terms,
  restricts the beta, or sunsets it, we migrate (the port makes that bounded, not free).
- **Sending reputation is unproven** for a young platform relative to a deliverability
  specialist like Postmark. For a must-not-fail reminders channel this is the real,
  accepted trade-off — mitigated by trivial volume and the swappable port, not eliminated.
- **Beta feature gaps.** Mature providers offer bounce/complaint webhooks, suppression
  lists, detailed analytics, and dedicated IPs; an open-beta service may lag on these. None
  are needed at two-user volume today, but they are the kind of capability we would reach
  for exactly when deliverability trouble appears.
- **Deeper Cloudflare lock-in**, compounding the vendor concentration ADR-0006 already
  noted. The port confines the blast radius to one adapter.

## Pros and Cons of the Options

### A. Cloudflare Email Sending (open beta) _(chosen)_

- ✅ Good, because it is native to the stack — a binding beside D1 and Queues, same
  `wrangler` local-dev, same dashboard, same bill (ADR-0006 consistency).
- ✅ Good, because marginal cost is ~zero: no new vendor bill on top of the Workers Paid
  plan already paid for Queues.
- ✅ Good, because with the domain in Cloudflare DNS the SPF/DKIM/DMARC records are
  provisioned in-platform — less setup and less drift than a third-party sender.
- ❌ Bad, because it is **open beta** — maturity, SLA, and feature completeness are less
  proven than GA alternatives.
- ❌ Bad, because a young shared-sending platform's deliverability reputation is unproven
  for a channel whose whole job is reliable arrival.
- ❌ Bad, because it deepens Cloudflare lock-in.

### B. Resend

- ✅ Good, because the developer experience is excellent and the HTTP API calls cleanly
  from Workers with plain `fetch`.
- ✅ Good, because it is GA with a free tier that comfortably covers this volume, and a
  solid deliverability reputation.
- ✅ Good, because its templating ecosystem is mature if reminder emails grow richer.
- ❌ Bad, because it is a **new external vendor** — a separate account, API-key secret,
  dashboard, and bill to manage.
- ❌ Bad, because authentication records must be added to Cloudflare DNS by hand and kept
  in sync with an out-of-platform sender.
- ❌ Bad, because it fragments the operational surface that A keeps unified.

### C. Postmark

- ✅ Good, because deliverability and transactional reputation are best-in-class, with
  separate transactional/broadcast streams — the strongest answer to the core risk.
- ✅ Good, because it is mature: bounce/complaint webhooks, suppression, and analytics are
  first-class.
- ✅ Good, because the HTTP API is simple to call from Workers.
- ❌ Bad, because it bills from low volume (only a small test allowance is free) — a real
  monthly cost for two users where A and B are effectively free.
- ❌ Bad, because it is a new external vendor with its own DNS setup and secret management.
- ❌ Bad, because its strengths (deliverability at scale, rich tooling) are largely wasted
  at two-user volume — right tool, wrong size.

### D. Amazon SES

- ✅ Good, because it is the cheapest at scale and among the most battle-tested,
  highest-reliability senders available.
- ✅ Good, because it is long-GA — no beta risk.
- ❌ Bad, because calling it from Workers means AWS SigV4 request signing with no
  first-party binding or SDK — the heaviest integration of the four for the smallest gain.
- ❌ Bad, because it introduces an **entirely separate cloud vendor** (account, IAM,
  sending sandbox and verification ceremony), directly contradicting the single-platform
  pull of ADR-0006.
- ❌ Bad, because its one standout driver — price at scale — is the driver that carries the
  least weight here.

### Also-rans (named, not weighed as first-class)

- **SendGrid / Mailgun / Brevo** — mature incumbent HTTP APIs that work from Workers, but
  they carry the identical "new external vendor" cost as Resend/Postmark with heavier APIs
  and, in some cases, softer deliverability reputations. They offer no advantage over
  Resend at this scale, so they are not weighed individually.
- **Self-hosted SMTP / own mail server** — a non-starter: the Workers runtime cannot run a
  mail server, and self-hosted email deliverability (IP warming, blocklist management,
  DMARC alignment) is a standing operations job wildly out of proportion to two users.

## Relationship to existing decisions

- **Extends [ADR-0006](0006-deployment-platform.md)** — the single-platform reasoning
  (one vendor, one bill, `wrangler` parity) is applied to outbound email; the noted
  Cloudflare lock-in deepens accordingly.
- **Serves the notifications consumer of
  [ADR-0010](0010-smart-events-for-durable-consumers.md) /
  [ADR-0011](0011-reliable-event-delivery-via-cloudflare-queues.md)** — email is the
  delivery channel for the durable **scheduler** shape. It is **distinct from** the
  scheduler primitive (ADR-0011 deferred that to Cron/DO alarms) and from the queue
  **transport** that carries the event; this ADR is only the final send.
- **Consistent with [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md)
  and [ADR-0005](0005-repository-contract.md)** — sending is a port; the provider is a
  swappable infrastructure adapter wired in the composition root.
- **Supersedes nothing.** No prior ADR records an email decision.
