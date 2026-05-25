# Repository Contract

- Status: accepted
- Date: 2026-05-24

## Context and Problem Statement

Repositories are the seam between the domain layer and persistence. Every aggregate that needs
to be stored or retrieved passes through one. The contract — where the interface lives, what
find methods return when nothing is found, what save returns — gets replicated across every
repository in the codebase, so an inconsistent or poorly reasoned default creates friction
everywhere.

## Decision Drivers

- Callers should be forced by the type system to handle the case where a record is not found
- The distinction between "not found" and "domain error" should be clear — finding nothing is
  often expected information, not a failure
- `save` should handle both insert and update transparently; the domain does not distinguish
  between creating and updating a persisted record
- Repository interfaces belong in the domain layer — infrastructure must depend on domain, not
  the other way around

## Considered Options

- **`T | null`** for single-record finds; `Promise<void>` for save
- **`T | undefined`** for single-record finds
- **`Result<T, NotFoundError>`** for single-record finds
- **`Option<T>`** (`None | Some<T>`) for single-record finds

## Decision Outcome

Chosen option: **`T | null` for single-record finds, `Promise<void>` for save**, because
`null` unambiguously means "looked for this, it does not exist" — TypeScript's strict null
checks force callers to handle it, and it requires no utility types. `save` returns void
because the domain generates its own identities (`AssetId.generate()` at construction time),
so there is nothing new to return after persistence.

### Positive Consequences

- `null` is unambiguous: it means deliberate absence, not an uninitialised value
- TypeScript's `strictNullChecks` forces every caller to handle the `null` case before using
  the result
- `save` with void return keeps the pattern simple; infrastructure uses upsert semantics so
  callers do not need to distinguish insert from update
- Repository interfaces in the domain layer mean the domain defines what it needs from
  persistence — infrastructure adapts to domain, never the reverse

### Negative Consequences

- `T | null` requires a null check at every call site; callers cannot chain calls without
  first asserting the result is non-null
- `save` returning void means any persistence failure surfaces as a thrown infrastructure
  exception rather than a typed error — this is intentional (see ADR-0004) but means save
  failures are not handled at the use case level

---

## Interface Shape

Repository interfaces are defined in `apps/api/src/domain/` alongside the aggregate they
serve. Implementations live in `apps/api/src/infrastructure/`.

```ts
// apps/api/src/domain/asset/AssetRepository.ts
export interface AssetRepository {
  findById(id: AssetId): Promise<Asset | null>;
  findByOwner(ownerId: UserId): Promise<Asset[]>;
  save(asset: Asset): Promise<void>;
}

// apps/api/src/domain/identity/UserRepository.ts
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

**Return type rules:**

| Method shape                     | Return type          | Notes                                           |
| -------------------------------- | -------------------- | ----------------------------------------------- |
| `findById` / `findByEmail`       | `Promise<T \| null>` | null = does not exist                           |
| `findByOwner` / collection finds | `Promise<T[]>`       | empty array = none found                        |
| `save`                           | `Promise<void>`      | upsert; infrastructure handles insert vs update |

## Caller Pattern

```ts
// Null must be handled before use — the type system enforces this
const asset = await this.assets.findById(id);
if (!asset) return err(new NotFoundError(`Asset ${id} not found`));

// Collection finds need no null check — empty array is valid
const assets = await this.assets.findByOwner(ownerId);
```

The decision of whether `null` is a domain error (`NotFoundError`) or expected information
depends on context. In `CloudflareAccessResolver`, a user not found triggers just-in-time
creation — not an error. In a `GetAsset` use case, an asset not found is a `NotFoundError`
that becomes a 404. The repository returns `null` in both cases; the caller decides what it
means.

---

## Pros and Cons of the Options

### `T | null` _(chosen)_

- ✅ Good, because `null` has a clear, established meaning in TypeScript: deliberate absence
- ✅ Good, because `strictNullChecks` makes handling mandatory — the type system does the work
- ✅ Good, because no utility type is needed
- ❌ Bad, because null checks add a line of boilerplate at every call site

### `T | undefined`

- ✅ Good, because it is consistent with many TypeScript built-ins (`Array.find`, `Map.get`)
- ❌ Bad, because `undefined` has dual meaning in TypeScript — uninitialised, optional
  property, or missing value — which makes "not found" less explicit than `null`
- ❌ Bad, because optional chaining (`?.`) makes it easier to accidentally propagate
  `undefined` without handling it

### `Result<T, NotFoundError>`

- ✅ Good, because not-found is modelled as a typed value requiring explicit handling
- ✅ Good, because it composes with the `Result` type already used at the use case boundary
- ❌ Bad, because not finding a record is frequently expected information rather than an
  error — forcing it through `Result` conflates "looked and didn't find" with "something went
  wrong"
- ❌ Bad, because use cases that handle not-found by creating a record (e.g.
  `CloudflareAccessResolver`) must unwrap a Result rather than check a simple null

### `Option<T>` / `Maybe<T>`

- ✅ Good, because it makes optionality a first-class concept with map/flatMap operations
- ❌ Bad, because TypeScript has no standard `Option` type — any implementation is a custom
  utility or third-party dependency
- ❌ Bad, because it adds a layer of wrapping that provides little benefit over `T | null`
  given TypeScript's existing null safety
