# Cross-Cutting Checklist

Work through each concern in order. Ask the user about unknowns rather than guessing. Reference the linked spec for canonical behavior.

---

## Authentication

[authentication.md](../../docs/specs/cross-cutting/authentication.md)

- Is this feature accessible **unauthenticated**? If yes, it must appear in the authentication spec exceptions list.
- Does it use `User.id` as a domain input (e.g. as `ownerId` or `requesterId`)?
- Does the frontend redirect to `/login` on 401 — and is this handled at the API client layer, not inside the component?

## Permissions

[permissions.md](../../docs/specs/cross-cutting/permissions.md)

- Who is permitted to perform this action?
- Are there ownership checks — can user A access or modify user B's resource?
- On authorization failure: 403 (access denied, existence known) or 404 (to avoid leaking existence)?

## Validation

[validation.md](../../docs/specs/cross-cutting/validation.md)

- What fields are required? optional?
- What are the format, length, or range constraints on each field?
- Is validation at the Zod HTTP edge (correct per ADR-0007) or inside the use case (anti-pattern)?
- Are there field-level errors that must map back to specific form fields?

## Error Handling

[error-handling.md](../../docs/specs/cross-cutting/error-handling.md)

- Which `DomainError` subclasses can this feature produce?
  `NotFoundError` (404) · `UnauthorizedError` (401) · `ForbiddenError` (403) · `ValidationError` (422) · `ConflictError` (409) · `InvariantError` (500)
- For each error: what does the user see? (message text, redirect, banner, field highlight)
- Are any errors field-specific? Which form field do they map to?

## Loading States

[loading-states.md](../../docs/specs/cross-cutting/loading-states.md)

- What async operations does this feature perform?
- What is shown while loading? (spinner, skeleton, disabled controls, "Saving…" label)
- What is shown on error — is there a retry mechanism?
- Are there intermediate states? (e.g. in-flight submit, mid-navigation loading, optimistic update)

## Telemetry

[telemetry.md](../../docs/specs/cross-cutting/telemetry.md)

- What API endpoints does this feature call or add? What operation name does each map to in `technicalTelemetry.ts`?
- Are any of these **new** endpoints? If so, add them to the operation name mapping and update `telemetry.md`.
- Does this feature produce any **domain events**? If yes:
  - Name the event, dataset (`pineapple_*_domain_events`), and binding
  - Define the full ordered `blobs[]` and `doubles[]` contract — use the `AssetCreated` table in `telemetry.md` as the pattern
- If read-only: confirm no domain event is needed (reads are excepted per `telemetry.md`)
- Is there anything this feature should measure that request telemetry alone cannot capture? (e.g. result counts, user fleet size, conversion signal, first-time vs. returning action)
