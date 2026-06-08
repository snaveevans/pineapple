---
audience: API contributors
purpose: how the API produces typed errors and maps them to HTTP responses
source: this file
date: 2026-06-08
---

# Error Handling (API) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/api`
**Applies To:** All API features unless listed in Exceptions
**Universal contract:** [error-envelope.md](../../../../docs/specs/universal/error-envelope.md)

---

## Summary

Errors flow from the domain outward through a typed hierarchy. Use cases express
failure as `Result<T, DomainError>`; HTTP handlers throw the error to a central
handler that maps it to the correct status code and the
[universal error envelope](../../../../docs/specs/universal/error-envelope.md).
This spec covers how the API **produces** that envelope; how the web side parses
it lives in
[`apps/web/specs/cross-cutting/error-handling.md`](../../../web/specs/cross-cutting/error-handling.md).

## Canonical Behavior

**Domain error types (`packages/shared/src/errors.ts`):**

| Subclass            | HTTP status | Meaning                                                      |
| ------------------- | ----------- | ------------------------------------------------------------ |
| `NotFoundError`     | 404         | Entity does not exist or is not visible to the requester     |
| `UnauthorizedError` | 401         | No valid session                                             |
| `ForbiddenError`    | 403         | Session is valid but requester lacks access to this resource |
| `ValidationError`   | 422         | Input failed a domain rule; carries an optional `field` name |
| `ConflictError`     | 409         | Operation would violate a uniqueness or state constraint     |
| `InvariantError`    | 500         | Internal invariant violated; a bug, not a user error         |

**Backend flow:**

1. Use cases return `ok(value)` or `err(domainError)` — they never throw domain
   errors.
2. Route handlers check `.ok`; if false, they `throw result.error`.
3. The global `app.onError` in `worker.ts` catches everything: domain errors are
   mapped via `toHttpError()`; non-domain errors are logged and returned as a
   generic 500.
4. Zod validation failures are caught by Hono's `defaultHook` before the handler
   runs, returning 422 in the envelope shape.

**Response shape:** All app error responses emit the
[universal error envelope](../../../../docs/specs/universal/error-envelope.md):
`{ error: string; field?: string }`. Routes under `/api/auth/*` are delegated to
Better Auth and are not processed by `app.onError`, so their error shapes are not
guaranteed to conform.

## Feature Integration Contract

Every API feature spec must document:

- Which domain errors the feature can produce and under what conditions.
- The status code and (where applicable) `field` path each maps to on the wire.

## Exceptions

| Feature       | Deviation                     | Reason                                                                                                       |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/auth/*` | Error envelope not guaranteed | Routes are delegated directly to Better Auth and bypass `app.onError`; Better Auth owns its own error shapes |

## Anti-Patterns

- **Throwing domain errors from use cases:** Use cases must return `err(...)`, never
  `throw`. Only route handlers throw, so the global handler cleanly owns the HTTP
  mapping boundary.
- **Catching errors in route handlers:** Handlers call `throw result.error` and
  trust `app.onError`. Adding a local try-catch in a handler bypasses central
  mapping.
- **Using non-domain error classes:** Throwing a plain `Error` or a class that does
  not extend `DomainError` will always produce a 500. Either it is a domain error
  (use the right subclass) or it is a bug (let it 500).
- **Different error envelopes in individual routes:** Every error must follow the
  universal envelope. The web `ApiError` parser depends on this contract.

## Known Issues

- **`InvariantError` responses expose `error.message` to the caller.**
  `toHttpError()` currently includes the domain error message in the response body
  for all error types, including `InvariantError`. For a 500, this may leak internal
  implementation details to API callers. **Planned:** decide whether `InvariantError`
  responses should include the message or return a generic `"Internal server error"`
  string, and enforce that policy in `toHttpError()`.
- **Unhandled errors are not wrapped before re-throwing.** When a use case
  encounters an unexpected exception (e.g., a database failure), it re-throws the raw
  error rather than wrapping it in `InvariantError`. The error surfaces as a generic
  500 with no domain context. **Planned:** use cases should catch unexpected errors
  and return `err(new InvariantError(...))` so the `Result` pattern stays consistent
  all the way to the handler and the error carries structured context.
