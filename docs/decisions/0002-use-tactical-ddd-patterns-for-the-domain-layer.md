# Use Tactical DDD Patterns for the Domain Layer

- Status: accepted
- Date: 2026-05-21

## Context and Problem Statement

Business logic needs to live somewhere. The naive answer — put it in service functions that
operate on plain data objects — works fine at small scale but degrades as a domain grows:
invariants get enforced inconsistently, state transitions are scattered across call sites, and
the code stops reflecting the language the team actually uses to talk about the problem.

We need an approach for the domain layer that keeps business rules close to the data they
govern, enforces invariants at the model boundary, and scales with complexity without requiring
a complete restructure later.

## Decision Drivers

- Invariants should be impossible to violate from outside the model (e.g. an `Asset` must always
  have a non-empty name — enforced at construction, not by caller convention)
- The code should use the same language as the problem domain — names like `Asset`, `AssetId`,
  and `create` should mean the same thing in code and in conversation
- Domain logic must be testable without spinning up infrastructure
- The approach should scale gracefully as the domain grows more complex

## Considered Options

- **Tactical DDD** — aggregates, value objects, factories, repositories, domain events
- **Anemic Domain Model + Service Layer** — plain data objects, business logic in services
- **Functional Core, Imperative Shell** — pure functions for domain logic, side effects at the
  edges

## Decision Outcome

Chosen option: **Tactical DDD**, because it directly addresses the invariant-enforcement and
ubiquitous-language drivers in a way the other options do not. The `Asset` aggregate already
demonstrates the pattern: a private constructor, a `create` factory that enforces the name
invariant, and a branded `AssetId` value object that makes identity explicit at the type level.
These are not conventions — they are constraints baked into the model itself.

### Positive Consequences

- Invariants are enforced at the aggregate boundary; callers cannot construct invalid state
- Domain concepts are first-class named types, not anonymous `{ id: string; name: string }`
  objects that callers must interpret correctly
- Domain logic is pure and infrastructure-free by default, making it straightforward to test
- The model self-documents the rules of the domain — reading `Asset.create` tells you what
  constitutes a valid Asset

### Negative Consequences

- More upfront structure than an anemic model; the cost is felt immediately, the benefit
  accrues over time
- Developers unfamiliar with DDD patterns need to learn the vocabulary (aggregate root, value
  object, factory, repository) before they can contribute confidently
- Mapping between the domain model and persistence (the impedance mismatch problem) is more
  involved than with an ORM-first approach; repositories must translate, not just proxy

---

## Pros and Cons of the Options

### Tactical DDD

Concrete patterns: aggregate roots with private constructors and factory methods, branded value
objects for identity and domain primitives, repository interfaces defined in the domain layer
(implemented in infrastructure), domain events for cross-aggregate communication.

- ✅ Good, because invariants are structurally enforced — the type system and factory methods
  make invalid state unrepresentable
- ✅ Good, because the ubiquitous language lives directly in the code, reducing the translation
  cost between problem space and solution space
- ✅ Good, because the domain layer has no infrastructure dependencies, keeping it fast to test
  and easy to reason about in isolation
- ❌ Bad, because the patterns carry a learning curve and look like overengineering on a
  simple CRUD screen
- ❌ Bad, because persistence mapping requires deliberate effort — you cannot just point an ORM
  at an aggregate and call it done

### Anemic Domain Model + Service Layer

Domain objects are plain data holders (interfaces or simple classes with no behaviour).
Business logic lives in service functions or classes that accept and return those data objects.

- ✅ Good, because it is the default most developers reach for — low learning curve, maps
  naturally to REST endpoints and ORM entities
- ✅ Good, because tooling (ORMs, code generators, OpenAPI) tends to assume this shape
- ❌ Bad, because invariants are enforced by convention rather than structure — any caller
  can construct `{ name: "" }` and pass it anywhere
- ❌ Bad, because business logic migrates toward wherever it is convenient rather than wherever
  it belongs, producing service classes that grow without bound
- ❌ Bad, because the domain language disappears into generic `UserService.updateUser()` shapes
  that describe operations rather than domain concepts

### Functional Core, Imperative Shell

All business logic is expressed as pure functions: `(state, input) => (newState, events)`.
Side effects (persistence, messaging, I/O) are handled entirely at the shell boundary.
No classes, no mutable objects — just data transformations.

- ✅ Good, because pure functions are maximally testable and easy to reason about
- ✅ Good, because the shell/core boundary makes the dependency direction explicit and
  mechanically enforced
- ✅ Good, because it fits TypeScript's strengths — discriminated unions and immutable data
  structures compose naturally with pure functions
- ❌ Bad, because TypeScript's OO heritage and most ecosystem tooling assumes classes; the
  functional style requires deliberate discipline to maintain consistently
- ❌ Bad, because modelling complex invariants across multiple fields in a purely functional
  style can produce awkward result-type chains that are harder to follow than a factory method
- ❌ Bad, because there is less established community convention for structuring a large
  functional domain layer in TypeScript than there is for tactical DDD
