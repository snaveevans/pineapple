---
audience: all contributors
purpose: the wire contract for API error responses — shared by API and web
source: this file
date: 2026-06-08
---

# Error Envelope — Universal Contract

**Status:** `active`
**Owner:** engineering
**Applies To:** Every `/api/*` response that is not 2xx (except `/api/auth/*`)

---

## Why this is universal

The error envelope is the one shape the **API** package produces and the **web**
package parses. It is the contract at the seam between the two packages, so it
lives here rather than inside either one. The API-side production rules live in
[`apps/api/specs/cross-cutting/error-handling.md`](../../../apps/api/specs/cross-cutting/error-handling.md);
the web-side parsing rules live in
[`apps/web/specs/cross-cutting/error-handling.md`](../../../apps/web/specs/cross-cutting/error-handling.md).
This file defines only the bytes on the wire that both sides must agree on.

## The Contract

**Response body:** Every non-2xx app error response is JSON of the shape:

```ts
{ error: string; field?: string }
```

- `error` — a human-readable message. Always present.
- `field` — optional. When present, identifies the input that caused the error,
  using **dot-notation** for nested paths (e.g. `"metadata.vin"`). The web side
  maps this path back to a form field for inline display; the API side emits it
  from Zod validation failures and from domain `ValidationError(message, field)`.

**Status codes:** The HTTP status carries the error category. The canonical
mapping is owned by the API package's `DomainError` hierarchy:

| Status | Category                                                      |
| ------ | ------------------------------------------------------------- |
| 401    | No valid session                                              |
| 403    | Session valid but requester lacks access to this resource     |
| 404    | Entity does not exist or is not visible to the requester      |
| 409    | Operation would violate a uniqueness or state constraint      |
| 422    | Input failed validation; envelope carries an optional `field` |
| 500    | Internal error / bug — message may be generic                 |

## Out of contract

- **`/api/auth/*`** routes are delegated to Better Auth and bypass the central
  error handler, so their error shapes are **not** guaranteed to conform to this
  envelope. Callers of auth routes must not assume `{ error, field }`. (See the
  session contract.)

## Consumers

- **API (producer):** maps `DomainError` → this envelope via `toHttpError()`;
  Zod failures are converted by Hono's `defaultHook`. Rules:
  [`apps/api/specs/cross-cutting/error-handling.md`](../../../apps/api/specs/cross-cutting/error-handling.md).
- **Web (parser):** `apiRequest()` constructs `ApiError(status, body)` from this
  shape. Rules:
  [`apps/web/specs/cross-cutting/error-handling.md`](../../../apps/web/specs/cross-cutting/error-handling.md).

## Anti-Patterns

- **Diverging the envelope in a single route.** The web `ApiError` parser depends
  on this exact shape. A route that returns a different shape silently breaks
  error rendering on the web side.
- **Inventing `field` paths that don't match.** The `field` dot-notation the API
  emits must match the paths the web side maps. A mismatch silently drops the
  inline field error — see the known issues in each package's validation spec.
