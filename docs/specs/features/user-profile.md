---
audience: product and API contributors
purpose: provision, read, and update the authenticated user's domain profile and onboarding state
source: this file
date: 2026-06-11
---

# User Profile

**Status:** `draft`
**Owner:** product and engineering
**Related Specs:** [authentication](../cross-cutting/authentication.md), [permissions](../cross-cutting/permissions.md), [validation](../cross-cutting/validation.md), [error handling](../cross-cutting/error-handling.md), [telemetry](../cross-cutting/telemetry.md)
**Web UX Intent:** [User Profile & Onboarding](../../web/FEATURES.md#user-profile--onboarding)

---

## Summary

The user profile capability gives each authenticated domain user a user-controlled display name. On first provisioning, Pineapple copies a valid name from the identity provider but requires the user to confirm or replace it before onboarding is considered complete. Later provider sessions never overwrite the confirmed domain profile.

Authentication email remains provider-controlled and read-only. It identifies the account but is never used or transformed into a display name. UX intent for onboarding and later profile editing lives in [docs/web/FEATURES.md](../../web/FEATURES.md#user-profile--onboarding).

## Current Behavior

- Better Auth stores the Google-provided name and email in its separate `user` table.
- `BetterAuthResolver` reads only the session email and provisions a domain `User` containing `id`, `email`, and `createdAt`.
- The domain `users` table has no profile name or onboarding-completion field.
- There is no application API for reading or updating the authenticated user's profile.

## Personas

- **DIYer Dale, first sign-in with a provider name:** needs to verify the imported name before entering the application.
- **DIYer Dale, first sign-in without a usable provider name:** needs to supply a name before onboarding can complete.
- **DIYer Dale, returning user:** needs provider sign-ins to preserve the name previously chosen in Pineapple.
- **DIYer Dale, established user:** needs to change the display name later without changing authentication identity.
- **Pineapple provisioning system:** needs to initialize the domain profile from trusted session data without treating it as user-confirmed.

## User Stories

- As **DIYer Dale**, I can **confirm or change my provider-supplied name** so that **the application uses the name I expect**.
- As **DIYer Dale**, I can **supply a name when my provider does not provide one** so that **I can complete onboarding**.
- As **DIYer Dale**, I can **update my display name later** so that **my experience remains personal and current**.
- As **a returning user**, I can **retain my Pineapple display name across sign-ins** so that **provider data does not overwrite my preference**.

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

## Edge Cases & Error States

| Scenario                                                        | Expected Behavior                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Provider supplies a valid name                                  | The trimmed name is copied, but onboarding remains incomplete pending confirmation            |
| Provider supplies no name, null, an empty string, or whitespace | The domain name is null and onboarding remains incomplete                                     |
| Provider name exceeds the profile limit                         | It is not copied; the domain name is null and onboarding remains incomplete                   |
| Existing user signs in after changing their Google name         | The confirmed Pineapple name and onboarding state remain unchanged                            |
| Update name is empty or whitespace-only                         | Return `ValidationError` as HTTP 422 with field `name`; persist nothing                       |
| Update name exceeds 100 characters after trimming               | Return HTTP 422 with field `name`; persist nothing                                            |
| Request has no valid session                                    | Return `UnauthorizedError` as HTTP 401                                                        |
| Authenticated user requests or updates a profile                | Operate only on the session-resolved user; cross-user targeting is impossible                 |
| Persistence fails                                               | Return `InvariantError` as HTTP 500 and do not report onboarding as completed                 |
| First confirmation repeats the provider-supplied name           | Complete onboarding and emit `UserOnboardingCompleted`; this is not a later name-change event |
| Completed user submits the currently stored name                | Treat as an idempotent successful update and do not emit `UserNameUpdated`                    |

## Permissions

The endpoints derive the target `UserId` from the authenticated session. They do not accept a path, query, or body user identifier. There is no administrator, delegate, or cross-user profile access.

## Telemetry

**Request telemetry:**

| Route                 | Operation           |
| --------------------- | ------------------- |
| `GET /api/users/me`   | `GetUserProfile`    |
| `PATCH /api/users/me` | `UpdateUserProfile` |

Both route patterns must be added to `createTechnicalTelemetryMiddleware` and the operation mapping in [telemetry](../cross-cutting/telemetry.md).

**Domain events:**

- `UserOnboardingCompleted` is published once, after the first valid profile update and successful persistence.
- `UserNameUpdated` is published after a completed user's name changes and persistence succeeds.
- Neither event contains the user's name or email.
- Both events use dataset `pineapple_user_domain_events` through the `USER_DOMAIN_TELEMETRY` binding.

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

## Out of Scope

- Profile or onboarding user interface; see [docs/web/FEATURES.md](../../web/FEATURES.md#user-profile--onboarding).
- Editing email, authentication provider data, avatar, or other account fields.
- Deriving a display name from the email local-part.
- Team profiles, roles, delegates, or administrators editing another user's profile.
- Blocking application API endpoints until onboarding is complete.

## Future Considerations

- **API onboarding enforcement:** The first release relies on the web application to keep an incomplete user inside onboarding. A future security or multi-client requirement may require centralized API middleware that permits incomplete users to access only authentication and self-profile endpoints.
- Additional onboarding fields may be added later; consumers must use the explicit onboarding state rather than infer completion from whether `name` is non-null.

## Open Questions

- None.
