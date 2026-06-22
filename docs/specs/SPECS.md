> **Audience:** everyone · **Purpose:** authoritative map of all feature and cross-cutting specs · **Source of truth:** this file · **Last reviewed:** 2026-06-18

# Spec Index

The spec system captures product behavior and intent — what a feature is
supposed to do and why — so the objective record survives as code changes over
time. Feature and cross-cutting specs are the source of truth for product
behavior. Specs are not API contracts (those live in `openapi.json`) and not
decisions about _how_ we built something (those live in `docs/decisions/`). They
answer: **what should this do, for whom, and under what conditions?**

See `templates/` for blank starting points and `prompts/` for AI prompts that
generate or sync specs from code and PRs.

## Cross-Cutting Specs

Concerns that apply to every feature. When writing a feature spec, reference the
relevant cross-cutting specs rather than re-describing the behavior.

| Spec                                                   | Concern                         | Status |
| ------------------------------------------------------ | ------------------------------- | ------ |
| [authentication.md](./cross-cutting/authentication.md) | Auth, sessions, identity        | active |
| [error-handling.md](./cross-cutting/error-handling.md) | Error states and user messaging | active |
| [permissions.md](./cross-cutting/permissions.md)       | Role-based access control       | active |
| [validation.md](./cross-cutting/validation.md)         | Input validation patterns       | active |
| [loading-states.md](./cross-cutting/loading-states.md) | Async UI states                 | active |
| [telemetry.md](./cross-cutting/telemetry.md)           | Telemetry and observability     | active |

## Feature Specs

| Spec                                                          | Area          | Status |
| ------------------------------------------------------------- | ------------- | ------ |
| [sign-in.md](./features/sign-in.md)                           | Auth          | review |
| [create-asset.md](./features/create-asset.md)                 | Assets        | draft  |
| [asset-library.md](./features/asset-library.md)               | Assets        | review |
| [app-search.md](./features/app-search.md)                     | Assets        | draft  |
| [dashboard.md](./features/dashboard.md)                       | Home          | draft  |
| [maintenance-record.md](./features/maintenance-record.md)     | Maintenance   | draft  |
| [maintenance-task.md](./features/maintenance-task.md)         | Maintenance   | draft  |
| [marketing-home.md](./features/marketing-home.md)             | Marketing     | active |
| [user-profile.md](./features/user-profile.md)                 | Identity      | draft  |
| [telemetry-enrichment.md](./features/telemetry-enrichment.md) | Observability | draft  |

## Directory Structure

```
docs/specs/
  SPECS.md                        ← this file
  templates/
    feature-spec.template.md      ← blank feature spec
    cross-cutting.template.md     ← blank cross-cutting spec
  prompts/
    retro-feature.md              ← AI prompt: generate spec from existing code
    retro-cross-cutting.md        ← AI prompt: identify cross-cutting concerns
    pr-sync.md                    ← AI prompt: sync spec after a PR merges
  cross-cutting/
    authentication.md
    error-handling.md
    loading-states.md
    permissions.md
    telemetry.md
    validation.md
  features/
    [feature-name].md
```

## Workflow

**Starting a new feature:** copy `templates/feature-spec.template.md` into
`features/`, fill it out before writing code, then link it here.

**Retroactively documenting existing code:** use the prompt in
`prompts/retro-feature.md`, review the output, and file it as a spec.

**After a PR merges:** run `prompts/pr-sync.md` against the diff to classify
changes and update the spec if behavior changed.
