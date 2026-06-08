> **Audience:** API contributors · **Purpose:** map of all API-package specs · **Source of truth:** this file · **Last reviewed:** 2026-06-08

# API Specs (`apps/api`)

Specs for **API capabilities** — what the backend can do, independent of any UI.
A capability is an endpoint (or a small set) plus its validation, ownership,
errors, and telemetry. The UX that consumes a capability lives in the
[web specs](../../web/specs/SPECS.md); each feature here links to its web
counterpart where one exists.

Specs are not API contracts — field names, types, and shapes live in
`docs/reference/openapi.json` (generated from Zod). Specs answer **what should
this capability do, for whom, and under what conditions?**

See the [top-level spec index](../../../docs/specs/SPECS.md) for how the API, web,
and universal specs fit together, and for templates and prompts.

## Cross-Cutting Specs (API)

Concerns that apply across API features. Reference these from a feature spec
rather than re-describing the behavior.

| Spec                                                   | Concern                                   | Status |
| ------------------------------------------------------ | ----------------------------------------- | ------ |
| [authentication.md](./cross-cutting/authentication.md) | Session resolution, JIT user provisioning | active |
| [permissions.md](./cross-cutting/permissions.md)       | Ownership & access enforcement            | active |
| [validation.md](./cross-cutting/validation.md)         | Zod (HTTP edge) + domain validation       | active |
| [error-handling.md](./cross-cutting/error-handling.md) | DomainError hierarchy → HTTP envelope     | active |
| [telemetry.md](./cross-cutting/telemetry.md)           | Request + domain-event telemetry          | active |

## Feature Specs (API)

| Spec                                          | Area   | Web counterpart                                                | Status |
| --------------------------------------------- | ------ | -------------------------------------------------------------- | ------ |
| [sign-in.md](./features/sign-in.md)           | Auth   | [web/sign-in](../../web/specs/features/sign-in.md)             | review |
| [create-asset.md](./features/create-asset.md) | Assets | [web/create-asset](../../web/specs/features/create-asset.md)   | draft  |
| [list-assets.md](./features/list-assets.md)   | Assets | [web/asset-library](../../web/specs/features/asset-library.md) | draft  |

## Directory Structure

```
apps/api/specs/
  SPECS.md                  ← this file
  cross-cutting/
    authentication.md
    permissions.md
    validation.md
    error-handling.md
    telemetry.md
  features/
    [capability-name].md
```
