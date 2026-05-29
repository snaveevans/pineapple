# Error Handling Strategy

- Status: accepted
- Date: 2026-05-24

## Context and Problem Statement

Error handling decisions touch every function signature in the codebase. The key tension is
between expressiveness and type safety: throwing exceptions is natural and readable, especially
in domain code where a factory method either succeeds or it doesn't — but it makes error
handling invisible to callers, who have no type-level signal that a function can fail. A
`Result<T, E>` return type makes failure explicit and forces callers to handle it, but applied
everywhere it makes even simple domain logic verbose and awkward to compose.

We need a consistent strategy that is expressive where expressiveness matters (the domain) and
type-safe where type safety matters (the application boundary that callers depend on).

## Decision Drivers

- Domain validation errors are expected, named conditions — not exceptional — and should be
  distinguishable from infrastructure failures and programming errors
- Use case callers (API route handlers) must be forced by the type system to handle the error
  case; an unhandled domain error silently becoming a 500 is not acceptable
- Domain code should remain readable — factory methods and aggregate mutations should read as
  happy-path operations, not as chains of Result-unwrapping
- Infrastructure failures (D1 unavailable, network timeout) should not be silently swallowed;
  they should propagate and produce an unambiguous 500

## Considered Options

- **Throw everywhere** — domain throws, use cases throw, API wraps everything in a top-level
  try/catch
- **Result everywhere** — domain functions return `Result<T, E>`, use cases return
  `Result<T, E>`, callers chain with explicit unwrapping at every step
- **Hybrid: throw in domain, Result at the use case boundary** — domain throws typed
  `DomainError` subclasses; use cases catch them and return `Result<T, DomainError>`; the API
  layer unwraps and maps to HTTP

## Decision Outcome

Chosen option: **Hybrid: throw in domain, Result at the use case boundary**, because it gives
each layer the style that fits it best. The domain layer reads naturally — `Asset.create()`
either returns an `Asset` or throws a `ValidationError`, which is how you would describe it in
conversation. The application layer exposes a typed contract — `CreateAsset.execute()` returns
`Result<AssetId, DomainError>`, which forces every caller to handle both cases. The API layer
pattern-matches on the error type to produce the correct HTTP response.

### Positive Consequences

- Domain code is readable and intention-revealing; no Result unwrapping clutters factory
  methods or aggregate mutations
- Every use case has a typed error contract — callers cannot ignore the failure case
- The `DomainError` class hierarchy maps cleanly to HTTP status codes in one place
- Infrastructure failures are not swallowed — only `DomainError` instances are caught at the
  use case boundary; everything else propagates

### Negative Consequences

- The boundary between "throw" code (domain) and "Result" code (application) requires
  discipline — an agent writing a new use case must remember to catch `DomainError` and wrap
  it, not let it propagate as an uncaught exception
- Two error-handling styles in one codebase requires developers to know which style applies
  where; this is mitigated by the layer rules in ADR-0003

---

## Error Type Hierarchy

Defined in `packages/shared/errors.ts`. All domain errors extend `DomainError`.

```
DomainError
├── NotFoundError       → 404
├── ForbiddenError      → 403
├── ConflictError       → 409
├── InvariantError      → 500 (a domain invariant was violated — indicates a bug)
└── ValidationError     → 400  (carries an optional `field` property)
```

`InvariantError` is for conditions that should never occur if the system is correct — use it
when an aggregate enters a state that the code should have prevented. It maps to 500 because
it signals a programming error, not a user error.

## Implementation Pattern

### Domain layer — throw typed errors

```ts
static create(props: { name: string; metadata: AssetMetadata }): Asset {
  if (!props.name.trim()) {
    throw new ValidationError('Asset name is required', 'name')
  }
  validateMetadata(props.metadata)
  // ...
}
```

### Use case boundary — catch DomainError, wrap in Result

```ts
async execute(cmd: CreateAssetCommand): Promise<Result<AssetId, DomainError>> {
  try {
    const asset = Asset.create({ ... })
    await this.assets.save(asset)
    await this.eventBus.publishAll(asset.pullEvents())
    return ok(asset.id)
  } catch (e) {
    if (e instanceof DomainError) return err(e)
    throw e  // infrastructure failures and programming errors propagate
  }
}
```

The `instanceof DomainError` check is the correct guard. Do not use string-based checks like
`e.name.endsWith('Error')` — these will catch unrelated errors and produce misleading responses.

### API layer — unwrap Result, map to HTTP

```ts
const result = await createAsset.execute(cmd);
if (!result.ok) return toHttpError(c, result.error);
return c.json({ id: result.value }, 201);
```

```ts
// toHttpError — single mapping from DomainError subclass to HTTP status
export function toHttpError(c: Context, error: DomainError): Response {
  const status =
    error instanceof NotFoundError
      ? 404
      : error instanceof ForbiddenError
        ? 403
        : error instanceof ValidationError
          ? 400
          : error instanceof ConflictError
            ? 409
            : 500;

  const body: Record<string, unknown> = { error: error.message };
  if (error instanceof ValidationError && error.field) body.field = error.field;
  return c.json(body, status);
}
```

---

## Pros and Cons of the Options

### Throw everywhere

Domain throws, use cases throw, a top-level error handler in the API catches and maps to HTTP.

- ✅ Good, because it is the simplest model — one style, no boundary to remember
- ✅ Good, because domain code reads naturally with no Result overhead anywhere
- ❌ Bad, because error handling is invisible in type signatures — nothing tells a caller that
  a function can fail with a specific typed error
- ❌ Bad, because a missed catch anywhere in the call chain silently produces a 500; there is
  no compile-time guarantee that domain errors are handled

### Result everywhere

Every function that can fail returns `Result<T, E>`. Domain methods, use cases, and
infrastructure all return Results; callers chain with explicit unwrapping.

- ✅ Good, because every possible failure is visible in the type signature from domain to API
- ✅ Good, because it is consistent — one style throughout
- ❌ Bad, because domain code becomes cluttered with Result wrapping; `Asset.create()` returns
  `Result<Asset, ValidationError>` and every caller must unwrap before proceeding
- ❌ Bad, because composing multiple Results (validate name, validate metadata, generate id)
  requires explicit chaining that obscures the happy path
- ❌ Bad, because TypeScript lacks native monadic composition (no `?` operator like Rust),
  making deep Result chains significantly noisier than equivalent throwing code

### Hybrid: throw in domain, Result at the use case boundary _(chosen)_

Domain throws `DomainError` subclasses. Use cases catch them and return `Result<T, DomainError>`.
API layer unwraps and maps to HTTP.

- ✅ Good, because domain code reads as natural happy-path operations
- ✅ Good, because use case callers have a typed contract they cannot ignore
- ✅ Good, because the boundary is architecturally meaningful — use cases are already the
  defined interface between application and API layers (ADR-0003)
- ❌ Bad, because two styles exist and developers must know which applies where
- ❌ Bad, because a use case author must remember to catch `DomainError` — forgetting turns
  a domain validation failure into an uncaught exception and a 500
