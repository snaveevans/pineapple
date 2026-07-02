# Layered Error Handling Policy

- Status: accepted
- Date: 2026-07-02

## Context and Problem Statement

This supersedes [ADR-0004](0004-error-handling-strategy.md).

ADR-0004 made the right durable architectural choice: Pineapple should not rely
on invisible exception flow everywhere, and it should not force every domain
operation into noisy `Result` composition. It also mixed that decision with
implementation mechanism: concrete class lists, module names, status-code
tables, and code samples. Those details changed quickly. For example, the live
error catalog now includes authentication behavior and uses 422 for validation
failures, while ADR-0004 still records an older mapping.

The replacement decision needs to preserve the architectural policy while
moving volatile error catalog details to the cross-cutting error spec and the
generated API contract. This is especially important as new expected failure
types appear, such as rate-limit rejection for email verification sends. Adding
or changing a catalog entry should not require rewriting an architecture record
unless it changes the boundary policy itself.

## Decision Drivers

- **Typed expected failures.** Business, authorization, validation, and policy
  failures are expected outcomes and must remain distinguishable from
  infrastructure failures and programming errors.
- **Callers handle failure intentionally.** Application use cases are the
  boundary other layers call, so their expected failure contract should be
  visible in the type system.
- **Domain readability.** Aggregate behavior and value-object construction
  should read as direct domain logic rather than chains of error unwrapping.
- **Central transport mapping.** HTTP status codes and response envelopes should
  be translated at the API boundary, not scattered through domain or application
  code.
- **Documentation stability.** ADRs should record policy and rationale; the
  current error catalog, response shape, field metadata, and mapping details
  belong in specs and API contracts that are expected to evolve.
- **Layering.** The error policy must preserve the dependency rules in
  [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md): domain
  and application code must not depend on HTTP or framework details.

## Considered Options

- **Throw everywhere** — domain code, use cases, and API-facing flows all use
  exceptions for expected failures.
- **Result everywhere** — every operation that can fail returns an explicit
  result type, including domain factories and aggregate mutations.
- **Hybrid: domain raises typed failures; use cases return Results; API
  translates centrally.** _(chosen)_

## Decision Outcome

Chosen option: **Hybrid: domain raises typed failures; use cases return
Results; API translates centrally.**

Pineapple keeps a layered error-handling strategy:

- Domain code may raise typed domain failures for expected domain-rule
  violations.
- Use cases expose expected failures as `Result<T, DomainError>` so callers must
  handle success and failure intentionally.
- The API boundary centrally translates domain failures into the current
  transport contract.
- Infrastructure failures and programming errors remain distinct from expected
  domain/application failures and must not be disguised as ordinary user or
  policy errors.

The concrete error catalog, status mapping, response envelope, field metadata,
and frontend handling expectations are owned by
[error-handling.md](../specs/cross-cutting/error-handling.md) and, where exposed
over HTTP, the generated OpenAPI contract. A new expected failure category, such
as rate limiting, should be added to that catalog and mapped centrally. It does
not need a new ADR unless Pineapple changes the layered policy itself.

### Positive Consequences

- Preserves the original hybrid policy without keeping stale implementation
  detail in the ADR ledger.
- Makes the cross-cutting error spec the active source for the evolving error
  catalog and transport behavior.
- Keeps HTTP concerns at the API boundary and out of domain/application policy.
- Allows new expected failure categories, including rate-limit rejections, to
  use the same central error path as other application outcomes.

### Negative Consequences

- Readers must follow the ADR-to-spec link to find the current status mapping
  and response shape.
- The cross-cutting error spec must be kept current whenever the catalog or
  transport contract changes.
- The hybrid policy still requires discipline: use cases must convert expected
  domain failures into explicit results, and API handlers must not invent local
  response mappings.

---

## Pros and Cons of the Options

### Throw everywhere

- Good, because it is the simplest mental model: one error-handling style across
  the codebase.
- Good, because domain code can remain direct and readable without explicit
  result unwrapping.
- Bad, because expected failures are invisible in use-case type signatures.
- Bad, because a missed catch can turn a known business or policy outcome into an
  accidental internal error at the boundary.
- Bad, because it makes it easier for transport-specific handling to spread
  outside the API boundary.

### Result everywhere

- Good, because every expected failure is visible in the type signature at every
  layer.
- Good, because it uses one consistent style for expected failures.
- Bad, because small domain operations become noisy to compose.
- Bad, because domain code starts to reflect application-boundary mechanics
  instead of reading as direct domain behavior.
- Bad, because TypeScript does not provide language-level result propagation, so
  deeply composed domain logic requires manual unwrapping or helper abstractions.

### Hybrid: domain raises typed failures; use cases return Results; API translates centrally

- Good, because domain code stays readable while use-case callers still get an
  explicit success/failure contract.
- Good, because the use-case boundary is already the architectural boundary
  between application behavior and API handling in
  [ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md).
- Good, because transport mapping remains centralized at the API boundary.
- Good, because volatile catalog details live in documents intended to track
  current behavior.
- Bad, because the codebase has two expected-failure styles, and contributors
  need to know which layer uses which style.
- Bad, because use cases must consistently convert expected domain failures into
  explicit results.
- Bad, because the ADR is less self-contained for readers looking for the exact
  current HTTP mapping.
