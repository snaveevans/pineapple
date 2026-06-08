---
audience: web contributors
purpose: pre-submit validation as a UX convenience — frontend half
source: this file
date: 2026-06-08
---

# Validation (Web) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/web`
**Applies To:** All web views with user input

---

## Summary

The web app validates input before submission **purely as a UX convenience** — to
catch obvious mistakes before a network round-trip. It is **not** authoritative.
Every constraint is re-validated on the backend; the authoritative rules live in
[`apps/api/specs/cross-cutting/validation.md`](../../../api/specs/cross-cutting/validation.md).
Field errors that come back from the API arrive via the
[error envelope](../../../../docs/specs/universal/error-envelope.md)'s `field` path
and are mapped back to form fields here.

## Canonical Behavior

- `validateAssetForm()` catches obvious errors before a network round-trip to reduce
  friction. It must not be the only line of defense — the backend always
  re-validates.
- `toAssetFormError()` maps API error `field` paths (dot-notation from the
  [error envelope](../../../../docs/specs/universal/error-envelope.md)) back to form
  field keys for inline display.
- Mirror the backend's user-facing constraints (required/optional, ranges, lengths)
  closely enough that the common cases are caught client-side, but treat the API's
  422 response as the final word.

## Feature Integration Contract

Every web feature spec with input must document:

- Which fields it validates client-side and the messages shown.
- How validation errors are surfaced (field-level inline, banner, or both).
- Which API `field` paths it maps via `toAssetFormError()`.

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **Trusting frontend validation as authoritative:** Frontend validation can be
  bypassed. The backend is the source of truth (see the API validation spec).
- **Inventing field names in `toAssetFormError()`:** The mapping must match the exact
  dot-notation paths the API emits per the
  [error envelope](../../../../docs/specs/universal/error-envelope.md). Any mismatch
  silently drops a field error.

## Known Issues

- The frontend validation rules in `validateAssetForm()` are hand-maintained
  duplicates of the backend Zod + domain rules. They can drift from the backend
  without any compile-time signal. No mechanism currently exists to keep them in
  sync.
- Vehicle year validation: the backend uses `.refine()` for the dynamic upper bound,
  but the frontend validates year as a plain number comparison. If the upper-bound
  logic changes on the backend, the frontend will not follow automatically.
- `toAssetFormError()` maps only the known paths from the current schema. New nested
  fields require a manual update to the mapping function or the error silently goes
  unrendered.
