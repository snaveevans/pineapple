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

| Spec                                                          | Area          | Status      |
| ------------------------------------------------------------- | ------------- | ----------- |
| [sign-in.md](./features/sign-in.md)                           | Auth          | review      |
| [create-asset.md](./features/create-asset.md)                 | Assets        | draft       |
| [asset-library.md](./features/asset-library.md)               | Assets        | in-progress |
| [app-search.md](./features/app-search.md)                     | Assets        | in-progress |
| [dashboard.md](./features/dashboard.md)                       | Home          | in-progress |
| [activity-history.md](./features/activity-history.md)         | History       | in-progress |
| [notifications.md](./features/notifications.md)               | Notifications | active      |
| [maintenance-record.md](./features/maintenance-record.md)     | Maintenance   | draft       |
| [maintenance-task.md](./features/maintenance-task.md)         | Maintenance   | active      |
| [marketing-home.md](./features/marketing-home.md)             | Marketing     | active      |
| [user-profile.md](./features/user-profile.md)                 | Identity      | active      |
| [email-verification.md](./features/email-verification.md)     | Identity      | active      |
| [telemetry-enrichment.md](./features/telemetry-enrichment.md) | Observability | draft       |
| [teams-foundation.md](./features/teams-foundation.md)         | Teams         | in-progress |

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
yet ready to implement) → `review` (complete, ready to implement, no slice shipped yet) →
`in-progress` (at least one slice shipped but boxes remain) → `active` (fully implemented and
live on `main` — no `[ ]` remain); `deprecated` when retired. A single-slice feature can go
straight from `review` to `active`; `in-progress` is the natural state of a multi-slice spec
mid-delivery.

The **acceptance-criteria checkboxes are the live implementation checklist.** A box is checked
(`- [x]`) **only when its behavior is implemented and covered by a test on `main`** — not when
code is merely written. Each box carries exactly one **slice tag** (`` `S1` ``…) tying it to the
spec's Delivery Plan (see below). The spec advances to `active` once every box is checked. This
keeps the remaining work visible in the spec itself, so anyone (including a cold agent) can
resume without relying on external notes.

**Large specs are implemented in slices, planned in the spec itself.** Every feature spec carries
a **Delivery Plan** — a table of the slices it ships in (`| Slice | Scope | Issue | Depends on |`),
each slice an independently-reviewable increment normally tracked as a GitHub issue (see Backlog).
Each acceptance criterion carries **exactly one slice tag** (`` `S1` ``…) matching the plan, so
every box has a home and none is orphaned; a criterion that resists a single tag is too coarse and
gets split. A slice is **done** when its tagged boxes are all `[x]` with tests; its PR checks off
**only** its own boxes and includes that spec edit. The spec is `in-progress` from the first shipped
slice and becomes `active` when the final slice checks the last box. A feature that fits one PR uses
a one-line plan ("Single slice — the whole feature (`S1`)") and tags every box `S1`. A slice may be a
thin web increment whose criteria live in a sibling spec or `docs/web/FEATURES.md` rather than as
tagged boxes here — note that in the plan's Scope cell.
