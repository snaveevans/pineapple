# Cross-Cutting Checklist

Cross-cutting concerns are now **per-package**. Work through the section for the
package your spec lives in. If the feature spans both packages, do the API section
for the API spec and the Web section for the web spec. Ask the user about unknowns
rather than guessing. Reference the linked spec for canonical behavior.

The two wire-level **universal contracts** sit at the API↔web seam and are
referenced by both packages:

- [error-envelope.md](../../../docs/specs/universal/error-envelope.md) — the
  `{ error, field }` response shape and status codes
- [session-contract.md](../../../docs/specs/universal/session-contract.md) — session
  cookie transport, 401 semantics, `get-session`

---

# API specs (`apps/api`)

## Authentication

[authentication.md](../../../apps/api/specs/cross-cutting/authentication.md) ·
universal: [session-contract.md](../../../docs/specs/universal/session-contract.md)

- Is this route accessible **unauthenticated**? If yes, it must appear in the session
  contract's unauthenticated route table.
- Does it use `User.id` as a domain input (e.g. as `ownerId` or `requesterId`)?
- Does it correctly throw `UnauthorizedError` → 401 when no session (handled by the
  resolver middleware, not the handler)?

## Permissions

[permissions.md](../../../apps/api/specs/cross-cutting/permissions.md)

- Who is permitted to perform this action?
- Are there ownership checks — can user A access or modify user B's resource?
- Is `ownerId` derived from the session, never the request body?
- On authorization failure: 403 (access denied, existence known) or 404 (to avoid
  leaking existence)?

## Validation

[validation.md](../../../apps/api/specs/cross-cutting/validation.md)

- What fields are required? optional? What are the format, length, or range
  constraints?
- Is validation at the Zod HTTP edge (correct per ADR-0007) and/or the domain layer —
  not improvised in the route handler (anti-pattern)?
- Which `field` dot-notation paths can it emit (so the web side can map them)?

## Error Handling

[error-handling.md](../../../apps/api/specs/cross-cutting/error-handling.md) ·
universal: [error-envelope.md](../../../docs/specs/universal/error-envelope.md)

- Which `DomainError` subclasses can this feature produce?
  `NotFoundError` (404) · `UnauthorizedError` (401) · `ForbiddenError` (403) ·
  `ValidationError` (422) · `ConflictError` (409) · `InvariantError` (500)
- Does every error response conform to the universal error envelope?

## Telemetry

[telemetry.md](../../../apps/api/specs/cross-cutting/telemetry.md)

- What endpoints does this feature add? What operation name does each map to in
  `technicalTelemetry.ts`? Are any **new** (need adding to the mapping)?
- Does this feature produce any **domain events**? If yes:
  - Name the event, dataset (`pineapple_*_domain_events`), and binding
  - Define the full ordered `blobs[]` and `doubles[]` contract — use the `AssetCreated`
    table in `telemetry.md` as the pattern
- If read-only: confirm no domain event is needed (reads are excepted)
- Anything to measure that request telemetry alone cannot capture? (result counts,
  fleet size, conversion signal, first-time vs. returning action)

---

# Web specs (`apps/web`)

## Authentication

[authentication.md](../../../apps/web/specs/cross-cutting/authentication.md) ·
universal: [session-contract.md](../../../docs/specs/universal/session-contract.md)

- Is this view reachable **unauthenticated** (only the marketing/landing page is)?
- Does it send `credentials: "include"` and rely on the API for auth (no pre-render
  route guard)?
- Does it redirect to `/login` on 401 — handled at the API client layer, not inside
  the component?

## Validation (UX convenience)

[validation.md](../../../apps/web/specs/cross-cutting/validation.md)

- What does it validate pre-submit, and what messages are shown?
- Does it treat the backend as authoritative (frontend validation is convenience
  only)?
- Which API `field` paths does it map back to form fields via `toAssetFormError()`?

## Error Handling

[error-handling.md](../../../apps/web/specs/cross-cutting/error-handling.md) ·
universal: [error-envelope.md](../../../docs/specs/universal/error-envelope.md)

- For each user-visible error: what does the user see? (banner, inline field, redirect)
- Are any errors field-specific? Which form field do they map to?
- Does it parse the universal error envelope via `ApiError`, not an ad-hoc shape?

## Loading States

[loading-states.md](../../../apps/web/specs/cross-cutting/loading-states.md)

- What async operations does this feature perform (React Query reads/mutations)?
- What is shown while loading? (spinner, skeleton, disabled controls, "Saving…" label)
- What is shown on error — is there a retry mechanism?
- For collections: is the empty state handled distinctly from the error state?
- Are mutation errors cleared (`mutation.reset()`) when the user resumes editing?
