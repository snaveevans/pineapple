> **Audience:** web contributors · **Purpose:** map of all web-package specs · **Source of truth:** this file · **Last reviewed:** 2026-06-08

# Web Specs (`apps/web`)

Specs for **UX** — what a user sees and does on a screen. A web feature is a
view (or flow): its states, copy, interactions, and how it reacts to the API. The
backend capability a screen consumes lives in the
[API specs](../../api/specs/SPECS.md); each feature here links to its API
counterpart where one exists.

Specs answer **what should this screen do, for whom, and under what conditions?**
They are not API contracts (those live in `docs/reference/openapi.json`).

See the [top-level spec index](../../../docs/specs/SPECS.md) for how the API, web,
and universal specs fit together, and for templates and prompts.

## Cross-Cutting Specs (Web)

Concerns that apply across web features. Reference these from a feature spec
rather than re-describing the behavior.

| Spec                                                   | Concern                                    | Status |
| ------------------------------------------------------ | ------------------------------------------ | ------ |
| [authentication.md](./cross-cutting/authentication.md) | Credentials, 401→redirect, session state   | active |
| [validation.md](./cross-cutting/validation.md)         | Pre-submit validation (UX convenience)     | active |
| [error-handling.md](./cross-cutting/error-handling.md) | `ApiError` parsing, banners, field mapping | active |
| [loading-states.md](./cross-cutting/loading-states.md) | React Query loading/error/empty states     | active |

## Feature Specs (Web)

| Spec                                              | Area      | API counterpart                                              | Status |
| ------------------------------------------------- | --------- | ------------------------------------------------------------ | ------ |
| [sign-in.md](./features/sign-in.md)               | Auth      | [api/sign-in](../../api/specs/features/sign-in.md)           | review |
| [marketing-home.md](./features/marketing-home.md) | Marketing | — (public page)                                              | active |
| [asset-library.md](./features/asset-library.md)   | Assets    | [api/list-assets](../../api/specs/features/list-assets.md)   | draft  |
| [create-asset.md](./features/create-asset.md)     | Assets    | [api/create-asset](../../api/specs/features/create-asset.md) | draft  |
| [dashboard.md](./features/dashboard.md)           | Home      | — (no backing API yet; WIP)                                  | wip    |

## Directory Structure

```
apps/web/specs/
  SPECS.md                  ← this file
  cross-cutting/
    authentication.md
    validation.md
    error-handling.md
    loading-states.md
  features/
    [screen-name].md
```
