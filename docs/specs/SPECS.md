> **Audience:** everyone · **Purpose:** authoritative map of all feature and cross-cutting specs · **Source of truth:** this file · **Last reviewed:** 2026-07-03

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
| [activity-history.md](./features/activity-history.md)         | History       | draft  |
| [notifications.md](./features/notifications.md)               | Notifications | active |
| [maintenance-record.md](./features/maintenance-record.md)     | Maintenance   | draft  |
| [maintenance-task.md](./features/maintenance-task.md)         | Maintenance   | active |
| [marketing-home.md](./features/marketing-home.md)             | Marketing     | active |
| [user-profile.md](./features/user-profile.md)                 | Identity      | active |
| [email-verification.md](./features/email-verification.md)     | Identity      | active |
| [telemetry-enrichment.md](./features/telemetry-enrichment.md) | Observability | draft  |
| [teams-foundation.md](./features/teams-foundation.md)         | Teams         | review |

## Backlog (parked specs)

**Backlog and future work now live in GitHub issues, not this repo.** The codebase reflects
the current state of the app and the decisions behind it (ADRs); planned, proposed, or deferred
work is tracked as issues. See the convention in [`docs/README.md`](../README.md).

The `backlog/` folder is retained only for the one grandfathered **parked spec** below —
preserved design thinking that predates this convention. Do **not** add new deferrals here; file
an issue instead. Reactivate the parked spec by moving it into `features/` and adding a row to
the table above.

| Spec                                           | Area   | Why parked                                                                                                                                                                     |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [archive-asset.md](./backlog/archive-asset.md) | Assets | Worked out how asset archive should suspend tasks and cancel reminders; deferred — archive is not yet a real action, and it is out of scope for the current notifications work |

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
  backlog/
    [parked-spec].md             ← preserved but out of active scope
```

## Workflow

**Starting a new feature:** copy `templates/feature-spec.template.md` into
`features/`, fill it out before writing code, then link it here.

**Retroactively documenting existing code:** use the prompt in
`prompts/retro-feature.md`, review the output, and file it as a spec.

**After a PR merges:** run `prompts/pr-sync.md` against the diff to classify
changes and update the spec if behavior changed.

## Spec lifecycle & acceptance criteria

A spec's **`status`** tracks its lifecycle: `draft` (being written) → `wip` (incomplete, not
yet ready to implement) → `review` (complete, ready to implement) → `active` (implemented and
live on `main`); `deprecated` when retired.

The **acceptance-criteria checkboxes are the live implementation checklist.** A box is checked
(`- [x]`) **only when its behavior is implemented and covered by a test on `main`** — not when
code is merely written. The spec advances to `active` once every box is checked. This keeps the
remaining work visible in the spec itself, so anyone (including a cold agent) can resume without
relying on external notes.

**Large specs are implemented in slices.** When a spec is too big for one PR, split the work
into vertical slices, each tracked as a GitHub issue (see Backlog). The spec file stays whole;
each slice PR implements one coherent group of criteria and checks off **only** the boxes it
lands, including that spec edit in the same PR. Because criteria are grouped by concern, slices
usually own disjoint groups, so checkmarks rarely conflict. The spec becomes `active` when the
final slice checks the last box.
