# Monorepo Layer Architecture and Dependency Rules

- Status: accepted
- Date: 2026-05-21

## Context and Problem Statement

The project is a DDD application deployed as a Cloudflare Worker, with additional apps
anticipated in the future (a web client, admin tool, or similar). We need to decide how the
monorepo is structured, which concerns live in which layer, and — critically — which direction
dependencies are allowed to flow between layers. Without explicit rules, layer boundaries erode
under time pressure: infrastructure creeps into domain, routes call repositories directly, and
the architecture exists only in documentation rather than in the code.

## Decision Drivers

- Layer boundaries should be enforced structurally where possible, not just by convention
- Domain logic must remain infrastructure-free so it can be tested without spinning up D1 or
  HTTP handlers
- Cross-cutting utilities (error types, Result type, branded primitives) may be needed by
  future apps that do not share domain logic with the API
- The structure should not add more package overhead than the current stage of the project
  warrants — extract packages when a second app genuinely needs them, not speculatively

## Considered Options

- **All layers as separate workspace packages** — `packages/shared`, `packages/domain`,
  `packages/application`, `packages/infrastructure`, each a distinct npm package
- **Single app package with folder layers** — one `apps/api` package, all layers as folders
  inside `src/`
- **Shared utilities package + folder layers inside the app** — `packages/shared` as a
  workspace package for cross-cutting utilities; `apps/api` contains domain, application,
  infrastructure, and api as folders

## Decision Outcome

Chosen option: **Shared utilities package + folder layers inside the app**, because it places
the package boundary exactly where it earns its keep today. `packages/shared` contains code
that is genuinely cross-cutting and stable — any future TypeScript app could use it without
knowing anything about assets or users. The domain-through-api layers live as folders inside
`apps/api`, where TypeScript's own module resolution enforces the import rules via ESLint and
where there is no cross-package friction during active development.

The existing `packages/domain` is folded into `apps/api/src/domain/`. If a second application
is built that needs to share domain logic, extracting a `packages/domain` workspace package at
that point is a one-time refactor — not a decision that needs to be made speculatively now.

### Positive Consequences

- `packages/shared` has a clear, stable contract: no domain knowledge, no infrastructure
  dependencies — safe to import from any future app
- Domain logic is infrastructure-free by structure: `src/domain/` has no path to D1 or Hono
  without crossing a layer boundary that ESLint can flag
- No cross-package TypeScript friction during active development of the API
- The extraction path to `packages/domain` is available when genuinely needed

### Negative Consequences

- Folder-level layer boundaries are enforced by ESLint rules rather than package.json, which
  means a misconfigured lint rule or a `// eslint-disable` comment can violate them silently
- When a second app is built and `packages/domain` is extracted, there will be a refactor
  cost at that point — imports across the codebase will need updating

---

## Layer Structure

```
packages/
  shared/              # @snaveevans/pineapple-shared
                       # Result<T,E>, ok, err
                       # DomainError and subclasses
                       # Branded type primitives (AssetId, UserId, Email)

apps/
  api/                 # Cloudflare Worker
    src/
      domain/          # Aggregates, value objects, repository interfaces, domain events
      application/     # Use cases, EventBus interface, AuthenticatedUserResolver interface
      infrastructure/  # D1 repositories, CF Access resolver, InMemoryEventBus
      api/             # Hono routes, middleware, request validation, error mapping
    wrangler.toml
    package.json
```

## Dependency Rules

Dependencies flow inward only. Each layer may import from layers listed under it; imports in
the reverse direction are forbidden.

| Layer                          | May import from                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `shared`                       | nothing (no project imports)                                                      |
| `domain`                       | `shared`                                                                          |
| `application`                  | `domain`, `shared`                                                                |
| `infrastructure`               | `application`, `domain`, `shared`                                                 |
| `api`                          | `application`, `domain` (types only — no direct aggregate construction), `shared` |
| composition root (`worker.ts`) | all layers — this is the only file that wires implementations to interfaces       |

The "types only" rule for `api → domain`: route handlers and middleware may reference domain
types for TypeScript signatures (e.g. `User` in auth middleware), but must never construct
aggregates or call repository methods directly. All domain behaviour is accessed through
application-layer use cases.

## Enforcement

Import direction rules are enforced via ESLint using
[`eslint-plugin-import`](https://github.com/import-js/eslint-plugin-import) or
[`eslint-plugin-boundaries`](https://github.com/javierbrea/eslint-plugin-boundaries). The
specific plugin choice is a follow-on decision; the rules to enforce are:

- `domain/` may not import from `application/`, `infrastructure/`, or `api/`
- `application/` may not import from `infrastructure/` or `api/`
- `infrastructure/` may not import from `api/`
- No layer except the composition root may import from `infrastructure/` and `application/`
  simultaneously (that is the composition root's job)

---

## Pros and Cons of the Options

### All layers as separate workspace packages

All four layers — shared, domain, application, infrastructure — are separate npm workspace
packages. Each package.json enforces its dependency allowlist explicitly.

- ✅ Good, because package.json is the hardest possible boundary — TypeScript and the package
  manager both enforce it
- ✅ Good, because domain and application packages are immediately ready for reuse in a second
  app
- ❌ Bad, because four packages with cross-references create significant TypeScript project
  reference overhead with limited benefit while there is only one app
- ❌ Bad, because moving code between layers during active design requires package refactors,
  not just file moves

### Single app package with folder layers

One `apps/api` package. All layers are folders inside `src/`. No workspace packages beyond
the existing `packages/shared`.

- ✅ Good, because zero cross-package friction — imports are just relative paths
- ✅ Good, because moving code between layers is a file move, not a package refactor
- ❌ Bad, because `packages/shared` is abandoned, discarding already-working infrastructure
- ❌ Bad, because cross-cutting utilities like `Result<T,E>` and `DomainError` are locked
  inside the API app, unavailable to future apps without duplication or extraction

### Shared utilities package + folder layers inside the app _(chosen)_

`packages/shared` as a workspace package. Domain through api as folders inside `apps/api`.

- ✅ Good, because the one package boundary that earns its place today is kept
- ✅ Good, because active development of the API has no cross-package friction
- ✅ Good, because the extraction path to `packages/domain` exists when needed
- ❌ Bad, because folder boundaries are softer than package boundaries and require ESLint
  to compensate
