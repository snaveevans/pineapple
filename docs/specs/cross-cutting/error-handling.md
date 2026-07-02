---
audience: all contributors
purpose: canonical error flow for feature specs
source: this file
date: 2026-07-02
---

# Error Handling — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features unless listed in Exceptions

---

## Summary

Errors flow from the domain outward through a typed hierarchy. Use cases express failure as `Result<T, DomainError>`; HTTP handlers throw the error to a central handler that maps it to the correct status code and response shape. The frontend deserializes this shape into an `ApiError` class for uniform handling. Durable queue consumers run outside the HTTP request path — there is no central handler to catch a throw — so they consume the same `Result` directly and map it to an ack / retry / dead-letter decision instead of a status code.

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

**Durable queue-consumer flow:**

Event-ingestion consumers, email dispatch, and outbox relays run off a queue, not an HTTP request, so `app.onError` and the response envelope do not apply. They follow the same core rule — **use cases return `Result`, never throw** — and the consumer, not a route handler, interprets that `Result` and decides what happens to the message.

1. A use case invoked by a consumer classifies its failure as **transient** (a retry could succeed — an infrastructure blip, a read-after-write race, a lock contention) or **terminal** (a retry cannot help — malformed-but-schema-valid input, a referenced entity that is permanently gone, a violated invariant). **Retryability is a domain decision the use case owns and signals in its result**; the consumer does not infer it from the error subclass, because the same subclass (e.g. `NotFoundError`) can be transient in one path and terminal in another.
2. The consumer maps the outcome to a queue action:
   - **success →** ack the message; it is done.
   - **transient failure →** retry with backoff; once the queue's retry budget is exhausted, the message is dead-lettered.
   - **terminal failure →** dead-letter immediately, without burning retries on a message that can never succeed.
3. **Dead-lettering always drains into a durable dead-letter record** — a DLQ is not a holding pen that lets a message expire. A dead-lettered message must be observable so a permanently failing event or send is detectable, mirroring the deliverability requirement the feature specs place on email.
4. Delivery is **at-least-once**, so consumers must be **idempotent**: a redelivered or retried message that was already applied is a no-op, deduped on its stable event/batch id. Idempotency is what makes retry and dead-letter safe — it is a precondition of this flow, not an optimization.
5. An **unexpected exception that escapes a use case** (it threw instead of returning a `Result` — an Anti-Pattern below) is treated by the consumer as **transient** and retried, so a leaked throw fails safe (surfaced via retries and eventual dead-letter) rather than being silently acked. Use cases should still wrap unexpected errors as `err(InvariantError)` (see Known Issues) and mark a failure terminal only when a retry genuinely cannot help.

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
- **Silently acking a failed queue message:** A consumer that treats a use-case failure as done — acking without retrying a transient failure or dead-lettering a terminal one — loses the message with no record. Every terminal failure must land in a durable dead-letter record; a failure is never dropped on the floor.
- **Letting a use case throw into a consumer:** The same rule as route handlers — use cases invoked by a consumer return `err(...)` carrying a retryability signal, never throw. A raw throw forces the consumer to guess, and is only tolerated as the fail-safe transient path, not the design.

## Known Issues

- **`InvariantError` responses expose `error.message` to the caller.** `toHttpError()` currently includes the domain error message in the response body for all error types, including `InvariantError`. For a 500, this may leak internal implementation details to API callers. **Planned:** decide whether `InvariantError` responses should include the message or return a generic `"Internal server error"` string, and enforce that policy in `toHttpError()`.
- **Unhandled errors are not wrapped before re-throwing.** When a use case encounters an unexpected exception (e.g., a database failure), it re-throws the raw error rather than wrapping it in `InvariantError`. The error surfaces as a generic 500 with no domain context. **Planned:** use cases should catch unexpected errors and return `err(new InvariantError(...))` so the `Result` pattern stays consistent all the way to the handler and the error carries structured context.
