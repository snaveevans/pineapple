---
audience: API contributors
purpose: canonical validation pattern at the HTTP and domain boundaries
source: this file
date: 2026-06-08
---

# Validation (API) — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Package:** `apps/api`
**Applies To:** All API features with user input

---

## Summary

Input is validated at two authoritative boundaries on the backend: the HTTP edge
(Zod) and the domain (entity constructors and value objects). **All validation
ultimately runs on the backend.** The web side performs pre-submit validation as a
UX convenience only — that behavior lives in
[`apps/web/specs/cross-cutting/validation.md`](../../../web/specs/cross-cutting/validation.md)
and is explicitly not authoritative. Field-level errors are returned to the web
side via the
[error envelope](../../../../docs/specs/universal/error-envelope.md)'s `field`
path.

## Canonical Behavior

**HTTP boundary (authoritative):**

- Zod schemas in `apps/api/src/api/schemas/` use `@hono/zod-openapi` — they are the
  single source of truth for field types, required vs optional, and string
  constraints.
- `c.req.valid("json")` / `c.req.valid("param")` enforce the schema before the
  handler runs. Failures are caught by Hono's `defaultHook` and returned as 422
  with the `{ error, field }` envelope.
- Schemas carry `.openapi()` metadata and drive the generated OpenAPI spec. Never
  duplicate field definitions in docs.
- Use `.refine()` instead of `.max()` for dynamic upper bounds (e.g., current year)
  because the Workers runtime can freeze the clock at deploy time.

**Domain boundary:**

- Entity constructors and value objects (`Asset.create()`, `Email.from()`,
  `validateMetadata()`) validate business rules that Zod cannot express (e.g.,
  internal consistency across fields, format rules beyond simple string
  constraints).
- Domain validation throws `ValidationError(message, field)` where `field` uses
  dot-notation for nested paths (e.g., `"metadata.vin"`). That `field` flows out on
  the wire per the [error envelope](../../../../docs/specs/universal/error-envelope.md).
- Domain validation catches invalid states that would corrupt the data model. It is
  not a substitute for Zod — both layers run.

## Feature Integration Contract

Every API feature spec must document:

- The Zod schema file that validates the feature's inputs.
- Which fields are required vs optional and their constraints.
- Any domain validation rules that apply beyond Zod.
- The `field` paths the feature can emit, so the web side can map them.

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **Validating in the route handler body:** Validation runs automatically via
  `c.req.valid()`. Adding manual checks in the handler duplicates logic and breaks
  the Zod → OpenAPI chain.
- **Using `.max(new Date().getFullYear())` on year fields:** Workers can freeze the
  clock; use `.refine(val => val <= new Date().getFullYear(), ...)` instead.
- **Treating frontend validation as a backend substitute:** Frontend validation can
  be bypassed. All constraints must be enforced here.

## Known Issues

- **Path IDs are not validated as UUIDs at the HTTP boundary.** `AssetIdParamSchema`
  accepts any non-empty string, and `AssetId.from()` is a type cast rather than a
  validated parse. A malformed ID passes the Zod layer and reaches the repository.
  **Planned:** add UUID format validation to path ID schemas so malformed IDs are
  rejected with a 422 at the HTTP boundary before reaching the domain.
- Validation rules are expressed in three places: Zod schemas (this layer), domain
  methods (this layer), and the web `validateAssetForm()` (the other package). The
  web rules are hand-maintained duplicates — they can drift from the backend without
  any compile-time signal. No mechanism currently exists to keep them in sync.
- Domain validation error `field` paths use dot-notation nesting; the web
  `toAssetFormError()` maps only known paths. New nested fields require a manual
  update on the web side or the error silently goes unrendered. See the
  [error envelope](../../../../docs/specs/universal/error-envelope.md) anti-patterns.
