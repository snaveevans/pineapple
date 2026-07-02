---
audience: product and API contributors
purpose: provision, read, and update the authenticated user's domain profile — display name, onboarding state, and a user-controlled contact/notification email
source: this file
date: 2026-07-02
---

# User Profile

**Status:** `active`
**Owner:** product and engineering
**Related Specs:** [authentication](../cross-cutting/authentication.md), [permissions](../cross-cutting/permissions.md), [validation](../cross-cutting/validation.md), [error handling](../cross-cutting/error-handling.md), [telemetry](../cross-cutting/telemetry.md), [email-verification](./email-verification.md), [notifications](./notifications.md)
**Web UX Intent:** [User Profile & Onboarding](../../web/FEATURES.md#user-profile--onboarding)

---

## Summary

The user profile capability gives each authenticated domain user a user-controlled display name. On first provisioning, Pineapple copies a valid name from the identity provider but requires the user to confirm or replace it before onboarding is considered complete. Later provider sessions never overwrite the confirmed domain profile.

Authentication email remains provider-controlled and read-only. It identifies the account but is never used or transformed into a display name. Precisely because the auth email is "never used," the profile also holds a separate, **user-controlled contact / notification email** — the address the app is allowed to send to (reminders and future messages). A user may add or change this address, and each new value is stored **unverified** until the user proves ownership via [email-verification](./email-verification.md); [notifications](./notifications.md) will only email a **verified** contact email. UX intent for onboarding and later profile editing lives in [docs/web/FEATURES.md](../../web/FEATURES.md#user-profile--onboarding).

## Current Behavior

- Better Auth stores the Google-provided name and email in its separate `user` table.
- `BetterAuthResolver` reads only the session email and provisions a domain `User` containing `id`, `email`, and `createdAt`.
- The domain `users` table has no profile name or onboarding-completion field.
- The only email on the domain user is the provider auth `email`; there is no separate contact/notification email field, and no verified-state field.
- There is no application API for reading or updating the authenticated user's profile.

## Personas

- **DIYer Dale, first sign-in with a provider name:** needs to verify the imported name before entering the application.
- **DIYer Dale, first sign-in without a usable provider name:** needs to supply a name before onboarding can complete.
- **DIYer Dale, returning user:** needs provider sign-ins to preserve the name previously chosen in Pineapple.
- **DIYer Dale, established user:** needs to change the display name later without changing authentication identity.
- **DIYer Dale, adding a contact email:** has no notification email yet and wants to add one so the app can send him reminders.
- **DIYer Dale, updating a contact email:** already has a contact email (verified or not) and wants to change it, expecting the new address to require re-verification.
- **Pineapple provisioning system:** needs to initialize the domain profile from trusted session data without treating it as user-confirmed.

## User Stories

- As **DIYer Dale**, I can **confirm or change my provider-supplied name** so that **the application uses the name I expect**.
- As **DIYer Dale**, I can **supply a name when my provider does not provide one** so that **I can complete onboarding**.
- As **DIYer Dale**, I can **update my display name later** so that **my experience remains personal and current**.
- As **a returning user**, I can **retain my Pineapple display name across sign-ins** so that **provider data does not overwrite my preference**.
- As **DIYer Dale**, I can **add a contact email for myself** so that **the app has an address it may send my reminders to**.
- As **DIYer Dale**, I can **update my contact email** so that **reminders go to the inbox I actually read**.
- As **DIYer Dale**, I can **see whether my contact email is verified** so that **I know whether reminders will actually be emailed to me**.
- As **DIYer Dale**, I can **remove my contact email** so that **I can stop the app from emailing me**.

## Acceptance Criteria

- [ ] The domain `User` stores a nullable display name and a nullable onboarding completion timestamp.
- [ ] First-time provisioning trims and copies a non-empty provider name into the domain profile.
- [ ] First-time provisioning stores a null domain name when the provider name is absent, null, empty, or whitespace-only.
- [ ] Provisioning leaves onboarding incomplete regardless of whether a provider name was copied.
- [ ] Resolving an existing domain user never overwrites its name or onboarding state from later provider sessions.
- [ ] `GET /api/users/me` requires authentication and returns the authenticated domain user's profile, including email, nullable name, and nullable `onboardingCompletedAt`.
- [ ] `PATCH /api/users/me` requires authentication and accepts a required `name`.
- [ ] Updating a profile trims the submitted name, persists it, and returns the updated profile.
- [ ] A successful profile update completes onboarding atomically when onboarding was previously incomplete.
- [ ] Once onboarding is complete, later profile updates change the name without changing the original onboarding completion timestamp.
- [ ] Email is never accepted by the profile update endpoint and remains controlled by the authentication provider.
- [ ] A user can read and update only the profile resolved from their own authenticated session; no user ID is accepted from the request.
- [ ] The Zod schemas in `apps/api/src/api/schemas/` are the source of truth for the profile request and response contracts and generate the OpenAPI contract.
- [ ] The name schema requires 1 to 100 characters after trimming.
- [ ] Domain validation also rejects an empty or whitespace-only name and attributes the error to `name`.
- [ ] The existing application API remains accessible to authenticated users whose onboarding is incomplete.

### Contact / notification email

- [ ] The domain `User` stores a nullable `notificationEmail` (branded `Email`, **stored normalized** via the value object so it matches the auto-verify comparison and dedupes reliably) and a nullable `notificationEmailVerifiedAt` timestamp, independent of the provider auth `email`.
- [ ] `GET /api/users/me` additionally returns `notificationEmail` (nullable) and `notificationEmailVerified` (boolean derived from `notificationEmailVerifiedAt`, per [ADR-0009](../../decisions/0009-computed-fields-belong-in-api-read-models.md)); it never returns the provider auth email as editable.
- [ ] `PUT /api/users/me/notification-email` requires an `email`, validated as a well-formed address via the branded `Email` value object at the Zod edge. If the address **equals the caller's provider-verified auth email** (normalized comparison), it is stored **verified immediately** — no token, no email — because the provider already proved ownership; this emits `NotificationEmailVerified`. Otherwise it is stored **unverified** (clearing any prior `notificationEmailVerifiedAt`) and requests an initial verification send through [email-verification](./email-verification.md), subject to that spec's rate limits.
- [ ] Submitting the address that is already the caller's current **verified** contact email is an idempotent no-op — no re-verification and no send.
- [ ] Submitting an address different from the current one always stores it unverified and requires re-verification; a previously verified state never carries over to a new address.
- [ ] `DELETE /api/users/me/notification-email` clears both `notificationEmail` and `notificationEmailVerifiedAt`, invalidates any outstanding verification tokens ([email-verification](./email-verification.md)), and returns the updated profile. It is **idempotent**: when no contact email is set it succeeds as a no-op returning the unchanged profile — never 404/409.
- [ ] Adding, changing, or removing the contact email never alters onboarding state; onboarding can complete with no contact email set, and the contact-email endpoints are usable both before and after onboarding is complete.
- [ ] The provider auth `email` is never modified by any profile endpoint and is never accepted as input; the display-name endpoint (`PATCH /api/users/me`) continues to reject any email field.
- [ ] All contact-email endpoints operate only on the profile resolved from the caller's own session; no user ID is accepted from the request.
- [ ] The Zod schemas in `apps/api/src/api/schemas/` are the source of truth for the contact-email request and response contracts and generate the OpenAPI contract.
- [ ] Reminder emails are sent only to a **verified** contact email; an absent or unverified contact email suppresses reminder emails while still creating the in-app notification (see [notifications](./notifications.md)).

## Edge Cases & Error States

| Scenario                                                        | Expected Behavior                                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider supplies a valid name                                  | The trimmed name is copied, but onboarding remains incomplete pending confirmation                                                           |
| Provider supplies no name, null, an empty string, or whitespace | The domain name is null and onboarding remains incomplete                                                                                    |
| Provider name exceeds the profile limit                         | It is not copied; the domain name is null and onboarding remains incomplete                                                                  |
| Existing user signs in after changing their Google name         | The confirmed Pineapple name and onboarding state remain unchanged                                                                           |
| Update name is empty or whitespace-only                         | Return `ValidationError` as HTTP 422 with field `name`; persist nothing                                                                      |
| Update name exceeds 100 characters after trimming               | Return HTTP 422 with field `name`; persist nothing                                                                                           |
| Request has no valid session                                    | Return `UnauthorizedError` as HTTP 401                                                                                                       |
| Authenticated user requests or updates a profile                | Operate only on the session-resolved user; cross-user targeting is impossible                                                                |
| Persistence fails                                               | Return `InvariantError` as HTTP 500 and do not report onboarding as completed                                                                |
| First confirmation repeats the provider-supplied name           | Complete onboarding and emit `UserOnboardingCompleted`; this is not a later name-change event                                                |
| Completed user submits the currently stored name                | Treat as an idempotent successful update and do not emit `UserNameUpdated`                                                                   |
| User adds a contact email that differs from their auth email    | Address stored unverified; an initial verification send is requested ([email-verification](./email-verification.md))                         |
| User sets their contact email to their Google sign-in email     | Stored **verified immediately**; no token, no email sent (provider already proved ownership)                                                 |
| User changes their contact email to a new (non-auth) address    | New address stored unverified; prior verified state does not carry over; re-verification requested                                           |
| User re-submits their current, already-verified contact email   | Idempotent no-op; no re-verification and no send                                                                                             |
| User submits a malformed email address                          | Return `ValidationError` as HTTP 422 with field `email`; persist nothing                                                                     |
| Verification send is blocked by a rate limit                    | Address is still stored unverified; the send is refused with 429 per [email-verification](./email-verification.md); the user may retry later |
| User removes their contact email                                | `notificationEmail` and verified state cleared; outstanding verification tokens invalidated; reminder emails suppressed thereafter           |
| User calls `DELETE` when no contact email is set                | Idempotent success; unchanged profile returned; never 404/409                                                                                |
| Provider (Google) auth email changes later                      | The contact email and its verified state are unchanged — ownership was proven independently                                                  |
| User has an unverified contact email when a reminder fires      | In-app notification is created; no email is sent (see [notifications](./notifications.md))                                                   |

## Permissions

The endpoints derive the target `UserId` from the authenticated session. They do not accept a path, query, or body user identifier. There is no administrator, delegate, or cross-user profile access. The contact-email endpoints (`PUT`/`DELETE /api/users/me/notification-email`) follow the same rule — they act only on the caller's own profile. Confirming a verification token is **not** a profile endpoint; it is owned by [email-verification](./email-verification.md) and authorizes on the token, not the session.

## Telemetry

**Request telemetry:**

| Route                                     | Operation                 |
| ----------------------------------------- | ------------------------- |
| `GET /api/users/me`                       | `GetUserProfile`          |
| `PATCH /api/users/me`                     | `UpdateUserProfile`       |
| `PUT /api/users/me/notification-email`    | `SetNotificationEmail`    |
| `DELETE /api/users/me/notification-email` | `RemoveNotificationEmail` |

All four route patterns must be added to `createTechnicalTelemetryMiddleware` and the operation mapping in [telemetry](../cross-cutting/telemetry.md). The verification send/confirm routes (`RequestEmailVerification`, `ConfirmEmailVerification`) are owned by [email-verification](./email-verification.md), not this spec.

**Domain events:**

- `UserOnboardingCompleted` is published once, after the first valid profile update and successful persistence.
- `UserNameUpdated` is published after a completed user's name changes and persistence succeeds.
- `NotificationEmailUpdated` is published after the contact email is set or changed to a new address and persistence succeeds (not on an idempotent re-submit of the current verified address).
- `NotificationEmailRemoved` is published after the contact email is cleared and persistence succeeds.
- No event contains the user's name or any email address — telemetry handlers stay thin selective readers, per the [telemetry](../cross-cutting/telemetry.md) PII anti-pattern.
- All of these events use dataset `pineapple_user_domain_events` through the `USER_DOMAIN_TELEMETRY` binding. The verification-lifecycle events (`EmailVerificationRequested`, `NotificationEmailVerified`) share this dataset but are defined in [email-verification](./email-verification.md).

**`UserOnboardingCompleted` data point** (index: `user_id`):

| Field        | Name              | Value                                       |
| ------------ | ----------------- | ------------------------------------------- |
| `indexes[0]` | -                 | `user_id`                                   |
| `blobs[0]`   | `event_type`      | `"UserOnboardingCompleted"`                 |
| `blobs[1]`   | `aggregate_type`  | `"User"`                                    |
| `blobs[2]`   | `user_id`         | Domain user UUID                            |
| `blobs[3]`   | `schema_version`  | `"v1"`                                      |
| `blobs[4]`   | `result`          | `"success"`                                 |
| `blobs[5]`   | `source_use_case` | `"UpdateUserProfile"`                       |
| `doubles[0]` | `count`           | Always `1`                                  |
| `doubles[1]` | `event_time_ms`   | Event timestamp in milliseconds since epoch |

**`UserNameUpdated` data point** (index: `user_id`):

| Field        | Name              | Value                                       |
| ------------ | ----------------- | ------------------------------------------- |
| `indexes[0]` | -                 | `user_id`                                   |
| `blobs[0]`   | `event_type`      | `"UserNameUpdated"`                         |
| `blobs[1]`   | `aggregate_type`  | `"User"`                                    |
| `blobs[2]`   | `user_id`         | Domain user UUID                            |
| `blobs[3]`   | `schema_version`  | `"v1"`                                      |
| `blobs[4]`   | `result`          | `"success"`                                 |
| `blobs[5]`   | `source_use_case` | `"UpdateUserProfile"`                       |
| `doubles[0]` | `count`           | Always `1`                                  |
| `doubles[1]` | `event_time_ms`   | Event timestamp in milliseconds since epoch |

**`NotificationEmailUpdated` data point** (index: `user_id`):

| Field        | Name              | Value                                       |
| ------------ | ----------------- | ------------------------------------------- |
| `indexes[0]` | -                 | `user_id`                                   |
| `blobs[0]`   | `event_type`      | `"NotificationEmailUpdated"`                |
| `blobs[1]`   | `aggregate_type`  | `"User"`                                    |
| `blobs[2]`   | `user_id`         | Domain user UUID                            |
| `blobs[3]`   | `schema_version`  | `"v1"`                                      |
| `blobs[4]`   | `result`          | `"success"`                                 |
| `blobs[5]`   | `source_use_case` | `"SetNotificationEmail"`                    |
| `doubles[0]` | `count`           | Always `1`                                  |
| `doubles[1]` | `event_time_ms`   | Event timestamp in milliseconds since epoch |

> No email address appears anywhere in this data point — only the non-PII `user_id`.

**`NotificationEmailRemoved` data point** (index: `user_id`):

| Field        | Name              | Value                                       |
| ------------ | ----------------- | ------------------------------------------- |
| `indexes[0]` | -                 | `user_id`                                   |
| `blobs[0]`   | `event_type`      | `"NotificationEmailRemoved"`                |
| `blobs[1]`   | `aggregate_type`  | `"User"`                                    |
| `blobs[2]`   | `user_id`         | Domain user UUID                            |
| `blobs[3]`   | `schema_version`  | `"v1"`                                      |
| `blobs[4]`   | `result`          | `"success"`                                 |
| `blobs[5]`   | `source_use_case` | `"RemoveNotificationEmail"`                 |
| `doubles[0]` | `count`           | Always `1`                                  |
| `doubles[1]` | `event_time_ms`   | Event timestamp in milliseconds since epoch |

## Implementation Requirements

- Add a `users`-table migration for `notificationEmail` and `notificationEmailVerifiedAt`.
- Update [data-model.md](../../reference/data-model.md) with the user fields and contact-email
  domain events. These are domain fields on the `users` table and must not be conflated with
  Better Auth's provider `email` in the singular `user` table.
- Regenerate the OpenAPI document from the new Zod schemas.

## Out of Scope

- Profile or onboarding user interface; see [docs/web/FEATURES.md](../../web/FEATURES.md#user-profile--onboarding).
- Editing the **provider auth** email, authentication provider data, avatar, or other account fields. (The user-controlled **contact/notification** email is now in scope; the auth email that identifies the account is not.)
- The verification **mechanism** — token issuance, the confirm endpoint, and rate limiting — owned by [email-verification](./email-verification.md). This spec only stores the address + verified state and triggers a send.
- **What** is sent to a verified contact email (reminders, digests) — owned by [notifications](./notifications.md).
- A separate "reminders deliverable" computed field on the profile — it would just equal `notificationEmailVerified`; clients derive deliverability from that rather than a duplicated field.
- Deriving a display name from either email's local-part.
- Team profiles, roles, delegates, or administrators editing another user's profile.
- Blocking application API endpoints until onboarding is complete.

## Future Considerations

- **API onboarding enforcement:** The first release relies on the web application to keep an incomplete user inside onboarding. A future security or multi-client requirement may require centralized API middleware that permits incomplete users to access only authentication and self-profile endpoints.
- Additional onboarding fields may be added later; consumers must use the explicit onboarding state rather than infer completion from whether `name` is non-null.
- **Multiple contact addresses / channels:** v1 stores exactly one contact email. Multiple addresses, or non-email channels, are future work and would extend rather than replace this field.
