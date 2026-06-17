---
audience: product, design, and web contributors
purpose: require first-time name confirmation and later support profile name editing
source: this file
date: 2026-06-11
---

# User Profile and Onboarding UX

**Status:** `draft`
**Owner:** product and design
**Counterpart:** [API user profile capability](../../../api/specs/features/user-profile.md)
**Related Specs:** [authentication](../../../../docs/specs/cross-cutting/authentication.md), [validation](../../../../docs/specs/cross-cutting/validation.md), [error handling](../../../../docs/specs/cross-cutting/error-handling.md), [loading states](../../../../docs/specs/cross-cutting/loading-states.md)

---

## Summary

After authentication, the web application verifies that the user has completed onboarding before displaying the rest of the authenticated experience. First-time users confirm or replace the name copied from their provider, or enter a name when none was available. Established users can later update the same profile name.

This spec records the intended UX but implementation is deferred.

## Personas

- **DIYer Dale with an imported name:** wants to confirm the suggested name quickly.
- **DIYer Dale without an imported name:** must enter a valid name before continuing.
- **DIYer Dale returning mid-onboarding:** must resume onboarding rather than see the application.
- **DIYer Dale with a completed profile:** wants the application to address them by their chosen name.
- **DIYer Dale editing a profile later:** wants clear save progress and recoverable errors.

## User Stories

- As **DIYer Dale**, I can **confirm my imported name during first-time onboarding** so that **the application addresses me correctly**.
- As **DIYer Dale**, I can **enter a name when no provider name is available** so that **I can complete onboarding**.
- As **a returning incomplete user**, I can **resume onboarding before seeing application content** so that **I finish the required setup**.
- As **an established user**, I can **update my name later** so that **my profile stays current**.

## Acceptance Criteria

- [ ] After authentication, the app loads `GET /api/users/me` before rendering authenticated application routes.
- [ ] An incomplete user sees only the onboarding experience, even when navigating directly to another authenticated route.
- [ ] The onboarding name field is prefilled when the API returns a provider-supplied name.
- [ ] The onboarding name field is empty when the API returns a null name.
- [ ] The user can edit a prefilled name before submitting.
- [ ] The user cannot complete onboarding with an empty, whitespace-only, or over-100-character name.
- [ ] Submitting onboarding calls `PATCH /api/users/me` and does not reveal application content while the request is in flight.
- [ ] After a successful update returns a non-null `onboardingCompletedAt`, the app enters the originally requested authenticated route or the default dashboard.
- [ ] Refreshing or signing in again while onboarding is incomplete returns the user to onboarding.
- [ ] A completed user is not shown onboarding again.
- [ ] Later profile editing reads and updates the same domain profile name.
- [ ] The saved domain profile name, not provider session data or email, is used for personalized greetings.
- [ ] A 401 during profile loading or saving is handled by the shared API-client authentication flow and returns the user to login.

## Edge Cases & Error States

| Scenario                                                             | Expected Behavior                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Profile is loading after authentication                              | Show a full-route loading state; render neither onboarding nor authenticated application content |
| Profile load fails with 401                                          | Redirect to login through shared authentication handling                                         |
| Profile load fails for another reason                                | Show a blocking error with retry; do not reveal authenticated application content                |
| Imported name is valid                                               | Prefill it and require explicit confirmation                                                     |
| Imported name is absent or invalid                                   | Show an empty required field                                                                     |
| Client validation fails                                              | Show an inline name error and do not submit                                                      |
| API returns a field error for `name`                                 | Show the message inline on the name field                                                        |
| Save is in flight                                                    | Disable duplicate submission and show a saving state                                             |
| Save fails without a field error                                     | Keep the entered name and show a retryable form-level error                                      |
| User directly navigates to an app route before completing onboarding | Preserve the intended route but render onboarding until completion                               |
| User refreshes during a save                                         | Reload profile state from the API; do not infer completion from local state                      |

## Telemetry

**Request telemetry:** `GET /api/users/me` maps to `GetUserProfile`; `PATCH /api/users/me` maps to `UpdateUserProfile`. The API counterpart owns the request and domain-event contracts.

**Domain events:** None emitted by the frontend. `UserOnboardingCompleted` and later `UserNameUpdated` are emitted by the API without profile values.

## Out of Scope

- Implementing the onboarding or later profile-editing screens in the current API capability work.
- Editing email, provider identity, avatar, or authentication settings.
- Additional onboarding questions beyond display name.
- Server-side blocking of other application endpoints for incomplete users.
- Team-member or delegated profile management.

## Future Considerations

- The route guard is a product-flow control, not an API authorization boundary. If additional clients are introduced or onboarding becomes security-sensitive, the API should enforce allowed endpoints for incomplete users.
- The completion marker is intentionally separate from `name` so future onboarding requirements can be added without redefining profile validity.

## Open Questions

- [ ] Where the later profile-editing control lives in the application navigation - product/design - before UX implementation.
- [ ] Exact onboarding copy and visual design - product/design - before UX implementation.
