---
audience: all contributors
purpose: canonical error flow for feature specs
source: this file
date: 2026-06-02
---

# Error Handling — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features unless listed in Exceptions

---

## Summary

Errors flow from the domain outward through a typed hierarchy. Use cases express failure as `Result<T, DomainError>`; HTTP handlers throw the error to a central handler that maps it to the correct status code and response shape. The frontend deserializes this shape into an `ApiError` class for uniform handling.

## Canonical Behavior

**Domain error types (`packages/shared/src/errors.ts`):**

| Subclass               | HTTP status | Meaning                                                      |
| ---------------------- | ----------- | ------------------------------------------------------------ |
| `NotFoundError`        | 404         | Entity does not exist or is not visible to the requester     |
| `UnauthorizedError`    | 401         | No valid session                                             |
| `ForbiddenError`       | 403         | Session is valid but requester lacks access to this resource |
| `ValidationError`      | 422         | Input failed a domain rule; carries an optional `field` name |
| `ConflictError`        | 409         | Operation would violate a uniqueness or state constraint     |
| `TooManyRequestsError` | 429         | Caller exceeded a rate limit and should retry later          |
| `InvariantError`       | 500         | Internal invariant violated; a bug, not a user error         |

**Backend flow:**

1. Use cases return `ok(value)` or `err(domainError)` — they never throw domain errors.
2. Route handlers check `.ok`; if false, they `throw result.error`.
3. The global `app.onError` in `worker.ts` catches everything: domain errors are mapped via `toHttpError()`; non-domain errors are logged and returned as a generic 500.
4. Zod validation failures are caught by Hono's `defaultHook` before the handler runs, returning 422 with `{ error: string; field?: string }`.

**Response envelope:** All app error responses follow `{ error: string; field?: string }`. Routes under `/api/auth/*` are delegated to Better Auth and are not processed by `app.onError`, so their error shapes are not guaranteed to conform to this envelope.

**Frontend:**

- `apiRequest()` in `apps/web/src/api/client.ts` constructs `ApiError(status, body)` for any non-2xx response.
- Callers access `.status`, `.message`, and `.field` to branch on error type.
- Field errors are mapped back to form field keys via `toAssetFormError()`.

## Feature Integration Contract

Every feature spec must document:

- Which domain errors the feature can produce and under what conditions.
- For each user-visible error, the message or UI treatment shown to the user.
- Any field-level validation errors and which form field they map to.

## Exceptions

| Feature       | Deviation                     | Reason                                                                                                         |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/api/auth/*` | Error envelope not guaranteed | Routes are delegated directly to Better Auth and bypasses `app.onError`; Better Auth owns its own error shapes |

## Anti-Patterns

- **Throwing domain errors from use cases:** Use cases must return `err(...)`, never `throw`. Only route handlers throw, so the global handler cleanly owns the HTTP mapping boundary.
- **Catching errors in route handlers:** Handlers call `throw result.error` and trust `app.onError`. Adding a local try-catch in a handler bypasses central mapping.
- **Using non-domain error classes:** Throwing a plain `Error` or a class that does not extend `DomainError` will always produce a 500. Either it is a domain error (use the right subclass) or it is a bug (let it 500).
- **Different error envelopes in individual routes:** Every error must follow `{ error: string; field?: string }`. The frontend `ApiError` parser depends on this contract.

## Known Issues

- **`InvariantError` responses expose `error.message` to the caller.** `toHttpError()` currently includes the domain error message in the response body for all error types, including `InvariantError`. For a 500, this may leak internal implementation details to API callers. **Planned:** decide whether `InvariantError` responses should include the message or return a generic `"Internal server error"` string, and enforce that policy in `toHttpError()`.
- **Unhandled errors are not wrapped before re-throwing.** When a use case encounters an unexpected exception (e.g., a database failure), it re-throws the raw error rather than wrapping it in `InvariantError`. The error surfaces as a generic 500 with no domain context. **Planned:** use cases should catch unexpected errors and return `err(new InvariantError(...))` so the `Result` pattern stays consistent all the way to the handler and the error carries structured context.
