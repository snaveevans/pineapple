---
audience: web contributors
purpose: how the web app parses API errors and surfaces them — frontend half
source: this file
date: 2026-06-08
---

# Error Handling (Web) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/web`
**Applies To:** All web views that call the API
**Universal contract:** [error-envelope.md](../../../../docs/specs/universal/error-envelope.md)

---

## Summary

The web app deserializes the API's error response into a uniform `ApiError` and
branches on it — redirecting on 401, mapping `field` errors to inputs, and showing
banners otherwise. The shape it parses is the
[universal error envelope](../../../../docs/specs/universal/error-envelope.md);
how the API produces it lives in
[`apps/api/specs/cross-cutting/error-handling.md`](../../../api/specs/cross-cutting/error-handling.md).

## Canonical Behavior

- `apiRequest()` in `apps/web/src/api/client.ts` constructs `ApiError(status, body)`
  for any non-2xx response, reading the `{ error, field }` envelope.
- Callers access `.status`, `.message`, and `.field` to branch on error type:
  - `401` → redirect to `/login` (delegated to the API client layer; see
    [authentication.md](./authentication.md)).
  - `field` present → map back to a form field key via `toAssetFormError()` and show
    the error inline (see [validation.md](./validation.md)).
  - otherwise → show an error banner with `.message`.
- The status → category meaning (404/403/409/422/500) is defined by the
  [universal error envelope](../../../../docs/specs/universal/error-envelope.md);
  the web side reacts to it but does not define it.

## Feature Integration Contract

Every web feature spec must document:

- For each user-visible error, the message or UI treatment shown (banner, inline
  field, redirect).
- Any field-level errors and which form field they map to.

## Exceptions

| Feature       | Deviation                     | Reason                                                                                   |
| ------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `/api/auth/*` | Error envelope not guaranteed | Better Auth owns its own error shapes; do not assume `{ error, field }` from auth routes |

## Anti-Patterns

- **Parsing a per-route ad-hoc error shape:** `ApiError` depends on the universal
  envelope. Reading some other shape for a single route diverges error rendering.
- **Handling 401 in the component instead of the API client:** see
  [authentication.md](./authentication.md).
- **Mapping `field` paths that don't match the API:** see [validation.md](./validation.md).
