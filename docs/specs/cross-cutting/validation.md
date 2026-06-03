---
audience: all contributors
purpose: canonical validation pattern for feature specs
source: this file
date: 2026-06-02
---

# Validation — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features with user input

---

## Summary

Input is validated at two distinct boundaries: the HTTP edge (Zod) and the domain (entity constructors and value objects). The frontend performs pre-submit validation as a UX convenience only — it is not authoritative. All validation ultimately runs on the backend.

## Canonical Behavior

**HTTP boundary (authoritative):**

- Zod schemas in `apps/api/src/api/schemas/` use `@hono/zod-openapi` — they are the single source of truth for field types, required vs optional, and string constraints.
- `c.req.valid("json")` / `c.req.valid("param")` enforce the schema before the handler runs. Failures are caught by Hono's `defaultHook` and returned as 422 with `{ error: string; field?: string }`.
- Schemas carry `.openapi()` metadata and drive the generated OpenAPI spec. Never duplicate field definitions in docs.
- Use `.refine()` instead of `.max()` for dynamic upper bounds (e.g., current year) because the Workers runtime can freeze the clock at deploy time.

**Domain boundary:**

- Entity constructors and value objects (`Asset.create()`, `Email.from()`, `validateMetadata()`) validate business rules that Zod cannot express (e.g., internal consistency across fields, format rules beyond simple string constraints).
- Domain validation throws `ValidationError(message, field)` where `field` uses dot-notation for nested paths (e.g., `"metadata.vin"`).
- Domain validation catches invalid states that would corrupt the data model. It is not a substitute for Zod — both layers run.

**Frontend (UX convenience only):**

- `validateAssetForm()` catches obvious errors before a network round-trip to reduce friction.
- It must not be the only line of defense — the backend always re-validates.
- `toAssetFormError()` maps API error `field` paths (dot-notation) back to form field keys for inline display.

## Feature Integration Contract

Every feature spec must document:

- The Zod schema file that validates the feature's inputs.
- Which fields are required vs optional and their constraints.
- Any domain validation rules that apply beyond Zod.
- How validation errors are surfaced to the user (field-level inline, banner, or both).

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **Validating in the route handler body:** Validation runs automatically via `c.req.valid()`. Adding manual checks in the handler duplicates logic and breaks the Zod → OpenAPI chain.
- **Using `.max(new Date().getFullYear())` on year fields:** Workers can freeze the clock; use `.refine(val => val <= new Date().getFullYear(), ...)` instead.
- **Trusting frontend validation as authoritative:** Frontend validation can be bypassed. All constraints must be enforced on the backend.
- **Inventing field names in `toAssetFormError()`:** The mapping must match the exact dot-notation paths produced by domain validation. Any mismatch silently drops a field error.

## Known Issues

- **Path IDs are not validated as UUIDs at the HTTP boundary.** `AssetIdParamSchema` accepts any non-empty string, and `AssetId.from()` is a type cast rather than a validated parse. A malformed ID passes the Zod layer and reaches the repository. **Planned:** add UUID format validation to path ID schemas so malformed IDs are rejected with a 422 at the HTTP boundary before reaching the domain.
- Validation rules are expressed in three places: Zod schemas (backend HTTP boundary), domain methods (backend domain layer), and `validateAssetForm()` (frontend). The frontend rules are hand-maintained duplicates — they can drift from the backend without any compile-time signal. No mechanism currently exists to keep them in sync.
- Vehicle year validation uses `.refine()` correctly on the backend, but the frontend validates year as a plain number comparison. If the upper bound logic changes, the frontend will not follow automatically.
- Domain validation error `field` paths use dot-notation nesting, but `toAssetFormError()` maps only the known paths from the current schema. New nested fields require a manual update to the mapping function or the error silently goes unrendered.
