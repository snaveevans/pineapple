---
name: email-verification
description: Double-opt-in proof that a user-entered contact email belongs to the user, via a single-use tokenized link, with per-address, per-user, and cooldown rate limits on verification sends
metadata:
  type: feature
---

# Email Verification

**Status:** active
**Owner:** product and engineering
**Last Updated:** 2026-07-02
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [user-profile.md](./user-profile.md), [notifications.md](./notifications.md)

---

## Summary

Email Verification is a standalone capability that proves a user-entered email address
actually belongs to the person who entered it, before the app sends anything else to it.
A user who sets a **contact / notification email** (see [user-profile.md](./user-profile.md))
receives a single-use tokenized link at that address; clicking it confirms ownership and
marks the address verified. Until then the address is untrusted and nothing else is sent to
it — the "suppress until verified" rule that [notifications.md](./notifications.md) depends
on.

This capability exists because a user-entered address is **not** the Google-provided auth
email. The auth email arrives already verified by the identity provider and is
provider-controlled and read-only ([user-profile.md](./user-profile.md)); a contact email
is typed by a human and could be a typo, someone else's inbox, or a deliberate target for
abuse. Verification closes that gap, and rate limits keep the verification-send path from
being turned into a spam cannon against a third party or the app's own sending reputation.

The web app surfaces this as a public `/verify-email` landing page that consumes the token.
UX intent (the "check your inbox" state, the success/expired/invalid states, the resend
affordance) is documented in [`docs/web/FEATURES.md`](../../web/FEATURES.md) when the screen
is built; this spec defines the API capability and behavior.

## Personas

- **DIYer Dale, first-time contact email:** entered a notification email in his profile and
  must click a link to confirm it before reminders can be emailed to him.
- **DIYer Dale, resending:** did not receive the email (spam folder, delay) or let it expire,
  and asks for a new link.
- **DIYer Dale, changed his mind:** entered address A, then changed to address B before
  verifying A; the link for A must no longer work.
- **DIYer Dale, stale link:** clicks a link that has expired, was already used, or was
  superseded by a newer send.
- **Bad actor, inbox spam:** repeatedly triggers verification sends toward a victim's address
  they do not own, trying to flood that inbox.
- **Bad actor, reputation burn:** hammers the send path to run up volume and damage the app's
  sending reputation / deliverability.
- **System: verification-send capability** — invoked by [user-profile.md](./user-profile.md)
  when a contact email is set or changed, and by the explicit resend endpoint; enforces rate
  limits and puts the verification email on the wire through the email port
  ([ADR-0012](../../decisions/0012-transactional-email-via-cloudflare-email-sending.md)).
- **System: confirm endpoint** — validates a presented token and, on success, stamps the
  address verified.
- **Sys admin:** requires proof of ownership before any additional email is sent, and requires
  the send path to be rate-limited so it cannot be abused.

## User Stories

- As **DIYer Dale**, I can **receive a verification link at a contact email I entered** so
  that **I can prove the address is mine**
- As **DIYer Dale**, I can **click that link to verify my contact email** so that **reminders
  and other messages can be delivered there**
- As **DIYer Dale**, I can **request a fresh verification email when I didn't get one or it
  expired** so that **a lost or stale link doesn't leave me stuck**
- As **DIYer Dale**, I am **protected from a replayed or superseded link** so that
  **verification is single-use, time-bounded, and always reflects my current address**
- As a **sys admin**, I can **require proof of ownership before any additional email is sent**
  so that **we never email an address the user has not confirmed**
- As a **sys admin**, I can **rate-limit verification sends per target address, per user, and
  with a cooldown between sends** so that **the endpoint can't be used to flood an inbox or
  burn our sending reputation**

## What Verification Governs

Verification is keyed by **(user, email address, purpose)**. In v1 the only purpose is the
user's own **notification contact email**. Verification always concerns the **authenticated
caller's own** address — a user can only ever request verification of an address attached to
their own profile, and can only confirm a token issued to themselves.

The `notificationEmailVerifiedAt` timestamp that [user-profile.md](./user-profile.md) stores is
set by exactly two paths, both owned here: a **successful token confirmation**, or the
**auto-verify-on-provider-match** shortcut (when the contact address equals the caller's
already-verified auth email, no round-trip is needed). This capability owns the token lifecycle,
the send + rate-limit behavior, the confirm transition, and the auto-verify rule; the profile owns
the address value itself.

## API Requirements

### Requesting a verification email

- [ ] **Auto-verify on provider match:** if the address submitted to
      `PUT /api/users/me/notification-email` equals the caller's already **provider-verified auth
      email** (compared via the normalized branded `Email` value object), it is stored
      **verified immediately** — **no token is issued and no email is sent** — because the identity
      provider (Google `email_verified`) has already proven ownership. This path emits the
      `NotificationEmailVerified` event directly. The auth email is only **read** for the
      comparison; it stays provider-controlled and read-only.
- [ ] Setting or changing the contact email to an address that does **not** match the verified
      auth email, through `PUT /api/users/me/notification-email`
      ([user-profile.md](./user-profile.md)), stores it unverified and requests an initial
      verification send as part of that operation
- [ ] `POST /api/users/me/notification-email/verification` requests a **resend** for the
      caller's current, still-unverified contact email and returns 202 on acceptance
- [ ] Both paths require an authenticated session; the target address is always the caller's
      own current contact email — no address is accepted in the resend request body
- [ ] A send is only issued for an address that is currently **unverified**; requesting
      verification for an already-verified current address is an idempotent no-op success (no
      new email, no new token)
- [ ] Requesting verification when the caller has **no** contact email set returns 409
      (nothing to verify)
- [ ] Every issued send creates a fresh single-use token and **invalidates all prior
      outstanding tokens** for that (user, address, purpose)
- [ ] The verification email is put on the wire through the email-sending port
      ([ADR-0012](../../decisions/0012-transactional-email-via-cloudflare-email-sending.md));
      the concrete provider is a swappable infrastructure adapter
- [ ] The send is **synchronous** with the request, so its failure is knowable at response
      time. If the provider send fails **after** the rate limits have passed, the explicit resend
      endpoint fails with **500** (`InvariantError`) instead of reporting acceptance — the caller
      learns the link was not sent and can retry immediately. A failed send is recorded as the
      `send_failed` outcome (Telemetry below) and is **not** counted against the cooldown or the
      daily caps, so the immediate retry is not itself throttled and a provider outage cannot
      silently exhaust a user's quota
- [ ] The email contains a link to the web app's public `/verify-email` page carrying the
      opaque token as a query parameter; it carries no other secret and no session assumption

### Rate limiting (anti-abuse)

- [ ] Verification sends are limited on three independent dimensions; exceeding **any** one
      rejects the send:
  - **Cooldown** — a minimum interval between consecutive sends to the same address (too-soon
    resends are refused)
  - **Per-address daily cap** — a maximum number of sends to a single target address within a
    rolling 24-hour window
  - **Per-user daily cap** — a maximum number of verification sends initiated by a single
    authenticated user within a rolling 24-hour window
- [ ] A rejected send returns **429** and is **not** put on the wire; the response indicates
      the user may retry later without revealing exact remaining quota
- [ ] Rate-limit counters key on the **target address** and the **authenticated user id**, not
      on client IP alone, so the limit cannot be trivially bypassed by rotating networks
- [ ] The confirm endpoint does not maintain a separate brute-force rate limit in v1; the token
      entropy makes guessing infeasible. Revisit only if abuse appears.
- [ ] The initial send triggered by `PUT …/notification-email` is subject to the same limits
      as an explicit resend
- [ ] The thresholds are a **60-second cooldown** between sends to the same address, **5 sends
      per address per rolling 24 hours**, and **10 verification sends per authenticated user per
      rolling 24 hours**. They are tunable configuration, not part of the API contract.
- [ ] The **per-address** cap counts every send to that address **across all users**, so a single
      targeted inbox is protected no matter how many accounts try to trigger sends to it; the
      per-user cap and the cooldown are the additional per-account controls.

### Confirming a token

- [ ] `POST /api/verify-email` accepts `{ token }` and, on a valid token, marks the associated
      (user, address) verified and returns 200
- [ ] Confirmation does **not** require a session — the token is the proof — so the link works
      even if the user opens it in a browser where they are not signed in
- [ ] A token is **single-use**: a successful confirmation consumes it; a second confirmation
      of the same token is rejected as no-longer-valid
- [ ] A token is **time-bounded** with a **24-hour TTL**: confirming after it expires returns an
      expired result
- [ ] Tokens are opaque and high-entropy and are **stored hashed at rest** — the raw token is
      never persisted in D1; a presented token is matched by hashing it and comparing
- [ ] A token is **superseded** when a newer send was issued for the same (user, address,
      purpose) or when the user changed their contact email after the token was issued;
      superseded tokens confirm as no-longer-valid
- [ ] Confirming a token whose address no longer matches the user's current contact email
      (they changed it) does **not** mark the current address verified
- [ ] Confirming when the current address is **already verified** (e.g. the user clicked an
      older copy of a still-current link after a duplicate send) is treated as an idempotent
      success, not an error
- [ ] Invalid, unknown, malformed, expired, superseded, and already-used tokens all return a
      single generic "this link is no longer valid" outcome that does not reveal which case
      applied and does not reveal whether the token ever existed
- [ ] The emailed link points at the **web** `/verify-email` page, which then issues the
      confirm `POST`; the API confirm route is not a bare `GET` the email client can auto-fetch,
      so email-scanner/link-prefetch traffic cannot silently consume a token

## Validation & Ownership

**Authentication:** The **request/resend** endpoints require a valid session (401 otherwise,
handled by the shared authentication middleware; the web client redirects to `/login` at the
API-client layer). The **confirm** endpoint is intentionally session-optional and authorizes
on the token alone — it is added to the authentication spec's unauthenticated-exceptions list.

**Permissions:** A user may only request verification for their own contact email and may only
confirm a token issued to them. No address or user id is accepted from the request body on the
resend path; the confirm path derives the user from the token, never from a caller-supplied id. A
contact address is **not globally unique** — two users may each hold and independently verify the
same address, because verification proves control per `(user, address)`; enforcing uniqueness is
deliberately avoided (it would leak existence and block legitimately shared inboxes).

**Validation (Zod HTTP edge, per [ADR-0007](../../decisions/0007-api-validation-boundary.md)):**

- `POST /api/verify-email` body: `token` — required, non-empty opaque string; malformed input
  is 422 at the edge, distinct from a well-formed-but-invalid token which is handled by the use
  case as the generic "no longer valid" outcome
- The resend endpoint takes no body
- The contact-email address format itself is validated where it is accepted, at
  `PUT /api/users/me/notification-email` ([user-profile.md](./user-profile.md)), using the
  branded `Email` value object — this spec never re-accepts a raw address

**Error mapping:**

- `UnauthorizedError` (401) — resend without a session
- `ConflictError` (409) — resend when no contact email is set
- `TooManyRequestsError` (429) — a send blocked by any rate-limit dimension
- `InvariantError` (500) — the provider send failed after the limits passed on the explicit
  resend endpoint; the caller learns the send did not go out and the failure is recorded as
  `send_failed`
- `ValidationError` (422) — malformed confirm body at the Zod edge
- The generic "link no longer valid" confirm outcome is a deliberate non-leaking result rather
  than a distinct not-found error, so token existence is never revealed

## Edge Cases & Error States

| Scenario                                                      | Expected Behavior                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User sets a contact email that differs from their auth email  | Address stored unverified; an initial verification send is requested (subject to rate limits)                                                                                                                                                                      |
| User sets a contact email equal to their Google sign-in email | Stored **verified immediately**; no token, no email sent; `NotificationEmailVerified` emitted                                                                                                                                                                      |
| Resend requested within the cooldown window                   | 429; no email sent; no new token issued                                                                                                                                                                                                                            |
| Resend requested past the per-address daily cap               | 429; no email sent                                                                                                                                                                                                                                                 |
| Resend requested past the per-user daily cap                  | 429; no email sent                                                                                                                                                                                                                                                 |
| Resend requested for an already-verified current address      | Idempotent success; no email, no new token                                                                                                                                                                                                                         |
| Resend requested when no contact email is set                 | 409                                                                                                                                                                                                                                                                |
| User changes A→B before verifying A                           | A's outstanding token is invalidated; a fresh send goes to B                                                                                                                                                                                                       |
| User clicks a valid, current link                             | Address marked verified; 200; reminders may now be emailed                                                                                                                                                                                                         |
| User clicks a link after its TTL                              | Generic "no longer valid" outcome                                                                                                                                                                                                                                  |
| User clicks a link that was superseded by a newer send        | Generic "no longer valid" outcome                                                                                                                                                                                                                                  |
| User clicks the same valid link twice                         | First confirms; second returns generic "no longer valid" (single-use), unless address is already verified (idempotent success)                                                                                                                                     |
| User clicks a link for an address they have since replaced    | Current address is **not** verified; generic "no longer valid" outcome                                                                                                                                                                                             |
| Token is malformed at the Zod edge                            | 422 validation error                                                                                                                                                                                                                                               |
| Token is well-formed but unknown/never existed                | Generic "no longer valid" outcome; existence never revealed                                                                                                                                                                                                        |
| Confirm attempted with no session                             | Allowed — token is the proof; the address's owning user is derived from the token                                                                                                                                                                                  |
| Email-scanner prefetches the emailed link                     | No token is consumed — confirmation is a `POST` issued by the web page, not a bare `GET`                                                                                                                                                                           |
| Resend endpoint: provider send fails after limits pass        | Request fails with **500**; the failure is recorded as `send_failed` telemetry (not `sent`); the failed send is **not** counted against the cooldown/daily caps, so the user can retry immediately                                                                 |
| Initial send on `PUT …/notification-email` fails at provider  | The address is still stored **unverified** (the profile update owns that write and succeeds); the send failure is surfaced to the client so it can prompt a resend, and is recorded as `send_failed` — the update is not rolled back over a transient send failure |
| Bad actor targets a victim's address, even from many accounts | Per-address cap is **global across users**, bounding total sends to that inbox regardless of how many accounts try; the victim never gets reminders (never clicks); no account enumeration                                                                         |

## Telemetry

**Request telemetry:**

| Route                                                | Operation                  |
| ---------------------------------------------------- | -------------------------- |
| `POST /api/users/me/notification-email/verification` | `RequestEmailVerification` |
| `POST /api/verify-email`                             | `ConfirmEmailVerification` |

Both route patterns must be added to the operation-name mapping in `technicalTelemetry.ts`
and the Operation Name Mapping table in [telemetry.md](../cross-cutting/telemetry.md). A route
shipped without a mapping entry falls through to `Unknown`.

**Domain events:** Two events, published to the existing user dataset
`pineapple_user_domain_events` (binding `USER_DOMAIN_TELEMETRY`, already declared). Telemetry
handlers stay **thin selective readers**: they record non-PII ids, enums, and outcomes only —
**never the email address or the token**, per the [telemetry.md](../cross-cutting/telemetry.md)
PII anti-pattern.

### `EmailVerificationRequested` — on each verification send decision (index: `user_id`)

Records accepted sends, rate-limited rejections, and **provider send failures** via `result`, so
both the throttle and a silently-undelivered verification link are observable. A `send_failed`
outcome means the send passed every rate limit and a token was issued, but the wire-send failed —
it is emitted instead of `sent`, never in addition to it.

| Field        | Name              | Value                                                                                         |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------- |
| `indexes[0]` | —                 | `user_id`                                                                                     |
| `blobs[0]`   | `event_type`      | `"EmailVerificationRequested"`                                                                |
| `blobs[1]`   | `aggregate_type`  | `"User"`                                                                                      |
| `blobs[2]`   | `user_id`         | Domain user UUID                                                                              |
| `blobs[3]`   | `purpose`         | `"notification_email"`                                                                        |
| `blobs[4]`   | `source`          | `"profile_update"` or `"resend"`                                                              |
| `blobs[5]`   | `schema_version`  | `"v1"`                                                                                        |
| `blobs[6]`   | `result`          | `"sent"`, `"throttled"`, `"noop_already_verified"`, `"no_address"`, `"send_failed"`           |
| `blobs[7]`   | `throttle_reason` | `"cooldown"`, `"per_address_cap"`, `"per_user_cap"`, or `"none"` (`"none"` for `send_failed`) |
| `doubles[0]` | `count`           | Always `1`                                                                                    |
| `doubles[1]` | `event_time_ms`   | Event timestamp (ms since epoch)                                                              |

### `NotificationEmailVerified` — on successful confirmation (index: `user_id`)

| Field        | Name             | Value                            |
| ------------ | ---------------- | -------------------------------- |
| `indexes[0]` | —                | `user_id`                        |
| `blobs[0]`   | `event_type`     | `"NotificationEmailVerified"`    |
| `blobs[1]`   | `aggregate_type` | `"User"`                         |
| `blobs[2]`   | `user_id`        | Domain user UUID                 |
| `blobs[3]`   | `purpose`        | `"notification_email"`           |
| `blobs[4]`   | `schema_version` | `"v1"`                           |
| `blobs[5]`   | `result`         | `"success"`                      |
| `doubles[0]` | `count`          | Always `1`                       |
| `doubles[1]` | `event_time_ms`  | Event timestamp (ms since epoch) |

## Implementation Requirements

- Rate-limit rejections use `TooManyRequestsError` (429), returned by the use case like every
  other expected outcome and mapped centrally at the API boundary. [ADR-0014](../../decisions/0014-layered-error-handling-policy.md)
  keeps the concrete error catalog out of the ADR ledger; add the subclass, central mapping, and
  [error-handling.md](../cross-cutting/error-handling.md) row with this implementation.
- A provider send failure is **not** an expected outcome: the request use case returns
  `err(InvariantError)` (500), and the `send_failed` telemetry is emitted before that error is
  returned so the failure is recorded even though the request fails. The rate-limit counters are
  advanced only for a send that actually reached the wire, so a `send_failed` never consumes quota.
- Verification tokens are stored in this domain capability's own D1 table, not Better Auth's
  singular `verification` table. Better Auth owns that table for auth flows; email verification
  needs a separate table and branded id keyed by `(user, address, purpose)`.
- Adding the token store requires updating [data-model.md](../../reference/data-model.md), adding
  the `/verify-email` page and "check your inbox" states to
  [`docs/web/FEATURES.md`](../../web/FEATURES.md), adding the confirm route to
  [authentication.md](../cross-cutting/authentication.md)'s unauthenticated-exceptions list, and
  regenerating the OpenAPI document from the new Zod route specs.

## Out of Scope

- The contact email **value** and its add/update/remove endpoints — owned by
  [user-profile.md](./user-profile.md)
- Deciding **what** gets sent to a verified address (reminders, digests) — owned by
  [notifications.md](./notifications.md)
- Verification via a typed numeric code, SMS, or any channel other than the tokenized email link
- Using the link as a **sign-in** mechanism (this proves address ownership, not identity; it is
  not passwordless auth)
- Verifying or changing the provider **auth** email, which remains provider-controlled and
  read-only
- Global/IP-only rate limiting as the primary control (IP may augment, but limits key on user
  and target address)
- Automated abuse alerting and one-click block lists (manual review is sufficient at two-user
  volume)

## Future Considerations

- Additional verification purposes beyond the contact email. The `(user, address, purpose)` key
  supports future verified addresses such as billing or team-invite addresses, but v1 ships only
  `notification_email`.
