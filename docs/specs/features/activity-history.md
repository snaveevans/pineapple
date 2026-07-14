---
name: activity-history
description: A durable, cross-asset timeline of the actions an owner-operator has taken — assets added, maintenance logged, and tasks scheduled, completed, or removed — filterable by action type and asset
metadata:
  type: feature
---

# Activity History

**Status:** in-progress
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-07-13
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [create-asset.md](./create-asset.md), [maintenance-record.md](./maintenance-record.md), [maintenance-task.md](./maintenance-task.md), [dashboard.md](./dashboard.md), [asset-library.md](./asset-library.md), [teams-foundation.md](./teams-foundation.md)

---

## Summary

Activity History gives an authenticated owner-operator a single, dedicated screen
that answers "what's been done across everything I look after?" — a
reverse-chronological, cross-asset record of the meaningful actions taken on the
assets they can access: adding an asset, logging maintenance,
scheduling a service task, completing a scheduled task, and removing a task. It is
distinct from the per-asset maintenance log ([maintenance-record.md](./maintenance-record.md),
which is one asset's service history) and from the [dashboard](./dashboard.md)
(which is forward-looking — what's due). History is backward-looking and spans
every asset.

**Team visibility.** With teams ([teams-foundation.md](./teams-foundation.md)), the feed
is no longer strictly single-owner: it spans every asset the caller can currently access —
their own assets **and** the assets teammates have shared with the caller's team. When an
action on a shared asset was taken by a teammate, the entry **attributes who did it** (an
acting-user display name), so "logged by Sam" reads correctly. Access follows _current_
sharing state: if an asset is later unshared, its entries drop out of the member's feed. A
member sees a shared asset's **full** history — including actions taken before it was shared —
exactly as its dependent maintenance records follow the asset. Everything not shared with the
caller stays invisible to them, as before.

History is backed by a **durable activity log**: a new consumer of the existing
domain-event stream persists each action to its own store, separate from the
telemetry handlers. This is deliberate — telemetry's Analytics Engine datasets are
sampled and retained only three months and are explicitly not an audit log
([telemetry.md](../cross-cutting/telemetry.md) anti-patterns). History needs an
exact, durable record, so it does not read from telemetry. The consumer is a **pure
projection**: it builds each entry directly from the enriched ("Smart") event payload
per [ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md), without
reading back to D1.

The web app surfaces this as its own page/route. UX intent (layout, day-grouping,
relative-date copy, filter chips, empty states) is documented in
[`docs/web/FEATURES.md`](../../web/FEATURES.md) when the screen is built; this spec
defines the API capability and behavior.

## Personas

- **Established owner-operator** — has assets and a maintenance history; the primary
  consumer of the feed.
- **New owner-operator (no activity yet)** — has just signed up or has taken no
  tracked actions since launch; sees the empty state.
- **Owner-operator mid-filter** — narrowing the feed by action type and/or a single
  asset.
- **Owner-operator reviewing removed/archived items** — deleted a task or archived
  an asset and still expects the historical entry to be there.
- **System actor: activity-log consumer** — a durable queue consumer, fed from the
  producer-side outbox ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)),
  that writes one entry per tracked action.
- **Team member viewing shared-asset activity** — a teammate who can access an asset
  shared with their team ([teams-foundation.md](./teams-foundation.md)). They see that
  asset's activity in their own feed and can tell which entries a teammate performed
  versus which are their own. Entries record an `actorId` distinct from the fleet
  owner, so multi-actor attribution is exposed (see Flags).
- **Team member acting on a shared asset** — when a member logs maintenance or manages
  tasks on an asset owned by a teammate, the resulting entry is attributed to them as
  the actor while remaining part of the asset's history.

## User Stories

- As an **authenticated owner-operator**, I can **open a dedicated History page and
  see a reverse-chronological feed of activity across every asset I can access**
  so that **I can recall what's been done without opening each asset one by one**
- As an **owner-operator**, I can **see each entry labeled with what happened, which
  asset it relates to, and when** so that **the feed is understandable at a glance**
- As an **owner-operator**, I can **filter the feed by action type** so that **I can
  focus on, for example, only the maintenance I've completed**
- As an **owner-operator**, I can **filter the feed by a single asset** so that **I
  can see everything I've done to that asset in one place**
- As an **owner-operator with a long history**, I can **load older activity beyond
  the first page** so that **I can review further back in time**
- As a **new owner-operator with no activity yet**, I can **see an explicit empty
  state** so that **I understand the feed will fill in as I use the app**
- As an **owner-operator who deleted a task or archived an asset**, I can **still see
  the historical entry for that action** so that **my record stays complete**
- As an **owner-operator who completed a scheduled task by logging work**, I can
  **see that as a single entry** so that **the feed isn't cluttered with duplicate
  rows for one action**
- As a **team member**, I can **see activity for the assets shared with my team in my
  feed** so that **I can follow what's been done to assets I help maintain without
  opening each one**
- As a **team member**, I can **tell who performed each action on a shared asset** so
  that **I know whether a teammate or I logged it**
- As a **user whose shared asset is later unshared**, I **stop seeing that asset's
  activity in my feed** so that **the feed only ever shows assets I can currently access**

## What Counts as Activity

Each tracked action becomes exactly one history entry. The five entry types and the
existing domain events that drive them:

| Entry type           | User action                                 | Source domain event(s)                                                                                                                |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `asset_added`        | Added an asset                              | `AssetCreated`                                                                                                                        |
| `maintenance_logged` | Logged maintenance with no task advancement | `MaintenanceRecordCreated` whose producer-owned `activityEntryType` is `maintenance_logged`                                           |
| `task_completed`     | Completed a scheduled task by logging work  | `MaintenanceTaskAdvanced`; the paired `MaintenanceRecordCreated` carries `activityEntryType: null`, so the pair is one entry, not two |
| `task_scheduled`     | Scheduled a maintenance task                | `MaintenanceTaskCreated`                                                                                                              |
| `task_deleted`       | Removed a maintenance task                  | `MaintenanceTaskDeleted`                                                                                                              |

Not tracked in v1: asset archive/unarchive (no domain event exists), profile/account
changes, and sign-in events. See Out of Scope.

> **The tracked events are enriched (Smart Events, [ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md)).**
> Each carries the asset snapshot (name/type) and its own `title`, plus the conclusion
> linking a maintenance record to a task completion — so History writes each entry
> **straight from the event** with no read-back to D1. Carrying the title on
> `MaintenanceTaskDeleted` is what lets a `task_deleted` entry render after the task row
> is gone. See Flags.

## Source, Durability & Lifecycle

These are behavioral guarantees, not storage prescriptions:

- **Starts empty.** There is no backfill of pre-launch data. History contains only
  actions taken after the feature is live; entries created before the feature
  existed do not appear.
- **Durable and complete for the life of the account.** Entries are not sampled and
  do not expire. The feed reflects the full record, not a time-limited or sampled
  window. (This is why History does not read from telemetry's Analytics Engine
  datasets.)
- **Durable, no-gap capture.** Recording an action never blocks, delays, or fails the
  user's underlying action — but it is **not** best-effort. Each tracked action is captured
  exactly once and is never silently dropped: the event is persisted atomically with the
  action it describes and delivered to the History consumer at least once, and the consumer
  dedupes on the event id so a redelivery cannot create a duplicate entry. A delivery or
  write failure is retried, not swallowed (see the outbox decision in Flags, per
  [ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)).
- **Self-contained entries.** Each entry is built from the enriched event payload
  (Smart Events, [ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md)),
  which carries the asset's name and type, the relevant title, and the performed date —
  so the entry renders on its own with no read-back. It remains fully readable after its
  underlying task is deleted or its asset is archived — it never renders as "unknown" and
  never disappears.
- **Immutable.** Entries are append-only. Renaming an asset later does not rewrite
  past entries (they reflect what was true when the action happened); History has no
  edit or delete capability.
- **Ordered by when the action happened in the app** (`occurredAt`). For maintenance
  entries the maintenance `performedAt` date is carried as display context but does
  not reorder the feed.

## Delivery Plan

| Slice | Scope                                                                                                                                                                                                          | Issue                                                    | Depends on                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------- |
| `S1`  | Base activity history — durable log + queue consumer, `GET /api/activity`, entries, server-side filtering, cursor pagination, the `/app/history` page. Shipped on `main` (see Flags: `S1` box reconciliation). | —                                                        | —                           |
| `S2`  | Shared-asset activity + actor attribution — feed spans owned + team-shared assets, entries expose the acting user, full shared-asset history. Delivers teams-foundation `S3`.                                  | [#73](https://github.com/snaveevans/pineapple/issues/73) | `S1`, teams-foundation `S2` |

## API Requirements

_Each criterion below carries exactly one slice tag (`S1` or `S2`) from the Delivery Plan above._

### Read model

- [ ] `S1` Add `GET /api/activity` as a protected application API endpoint
- [ ] `S1` The endpoint uses the resolved authenticated `User.id` as the identity input;
      no `ownerId` is accepted from the request
- [ ] `S1` The initial response returns the caller's activity in a single read model
      containing: the page of entries, the available filters with counts, and a
      pagination cursor
- [ ] `S2` The feed returns activity for every asset the caller can currently access:
      entries for assets the caller **owns**, plus entries for assets **currently
      shared with the caller's team** ([teams-foundation.md](./teams-foundation.md)).
      An entry is returned if and only if the caller can access its asset at request
      time — an asset later unshared no longer contributes entries
- [ ] `S1` The response never exposes another user's entries for assets the caller cannot
      access, nor raw `ownerId` or auth-provider identifiers
- [ ] `S1` Entries are returned newest first by `occurredAt`, with a stable secondary
      tiebreak (e.g. entry id) so equal timestamps have a deterministic order
- [ ] `S1` Each entry includes: a stable `id`, an entry `type` (one of `asset_added`,
      `maintenance_logged`, `task_completed`, `task_scheduled`, `task_deleted`),
      `occurredAt`, and an asset snapshot (`id`, `name`, `type`) sufficient to render
      the row without an additional lookup
- [ ] `S2` Each entry additionally carries an **actor** attribution (a stable acting-user
      id and a display name) identifying who performed the action
- [ ] `S2` The actor attribution lets the client mark an entry as the caller's own versus
      a teammate's (e.g. render "you" when the actor is the caller, otherwise the
      actor's display name); it exposes a display name and a stable id only — never
      the actor's email or auth-provider identifiers
- [ ] `S1` Maintenance-related entries (`maintenance_logged`, `task_completed`,
      `task_scheduled`, `task_deleted`) include the relevant title snapshot, and
      `maintenance_logged` / `task_completed` include the `performedAt` date
- [ ] `S1` Completing a scheduled task by logging work produces exactly one
      `task_completed` entry; it never also produces a separate `maintenance_logged`
      entry for the same record
- [ ] `S1` Logging maintenance that is not linked to a task produces one
      `maintenance_logged` entry
- [ ] `S1` Entries for deleted tasks and archived assets are still returned and fully
      renderable from their snapshot
- [ ] `S2` For a shared asset, the caller sees its **entire** activity history — including
      entries recorded before the asset was shared or before the caller joined the team
      — matching how a shared asset's maintenance records follow the asset. Sharing
      grants access to the asset's history; it does not slice the history by date

### Filtering (server-side)

- [ ] `S1` The feed can be filtered by action `type` and by `assetId` via query
      parameters; the two combine (logical AND)
- [ ] `S1` Filtering is performed server-side against the durable log — unlike the asset
      library and dashboard, the client does not filter a pre-loaded set, because the
      feed is unbounded and paginated
- [ ] `S1` The first page response includes `availableFilters`: the set of action types
      present in the caller's history with a count for each, and the set of assets
      present in that history (`id`, `name`, `type`) with a count for each
- [ ] `S1` Filter facet counts are computed over the caller's **complete** history, not
      the currently filtered view, so the user can pivot between filters (the same
      principle as the library's category counts in [asset-library.md](./asset-library.md))
- [ ] `S2` The `availableFilters` facets and their counts span the caller's **accessible**
      history, the same visibility rule as the feed: assets currently shared with the
      caller's team appear in the asset facet alongside owned assets, and an unshared
      asset's contribution drops out of the facets on the next request
- [ ] `S1` Assets that appear in history but are now archived are still listed in the
      asset filter facet, because they still have history
- [ ] `S1` A filter for an `assetId` the caller **cannot access** (neither owns nor has
      shared to them), or that has no entries, returns an empty entry list (not an
      error and not a leak of existence)
- [ ] `S1` v1 supports a single value per filter dimension (one type and/or one asset);
      multi-select and date ranges are out of scope
- [ ] `S1` The web UI may narrow the already-loaded entries by title or asset name for
      quick scanning, but this is not an API filter and does not search unloaded pages

### Pagination

- [ ] `S1` The endpoint is cursor-paginated; the response returns a `nextCursor` when more
      entries exist and a null/absent cursor when the caller has reached the end
- [ ] `S1` The client requests the next page by passing the returned cursor; the cursor is
      opaque to the client
- [ ] `S1` Cursor-page responses may return empty `availableFilters`; the client preserves
      the first page's facets while loading older entries
- [ ] `S1` A bounded page size applies (default and maximum defined at the Zod edge; the
      maximum keeps a single response within Analytics Engine / Worker limits and a
      reasonable payload size)
- [ ] `S1` Active filters are preserved across pages (the cursor is valid only within the
      same filter set, or the filter params are re-sent alongside the cursor)

## Validation & Ownership

**Authentication:** Available only to authenticated users. A missing or invalid
session returns 401 through the shared authentication middleware; the web client
redirects to `/login` at the API-client layer.

**Permissions:** Activity is scoped by what the resolved `User.id` can **access**, not
by ownership alone. An entry is visible to the caller when the caller can access its
asset at request time — they own the asset, or it is currently shared with their team
([teams-foundation.md](./teams-foundation.md), [permissions.md](../cross-cutting/permissions.md)).
Visibility is evaluated against **current** sharing state, so unsharing an asset (or a
member otherwise losing access) removes its entries from that member's feed on the next
request. The response exposes the acting user's display name and a stable id for
attribution, but never another accessor's email, raw `ownerId`, or auth-provider
identifiers. There are no mutation endpoints — History is read-only — so there is no
write-side ownership or 403-on-modify path.

**Validation (Zod HTTP edge, per ADR-0007):** Query parameters are validated at the
HTTP edge and drive the generated OpenAPI contract:

- `type` — optional; must be one of the five entry-type enum values
- `assetId` — optional; must be a UUID
- `cursor` — optional; opaque string
- `limit` — optional; integer within the supported range, with a default applied when
  absent

Invalid query parameters return 422. Because these are query parameters rather than a
form, validation errors are not mapped to specific form fields.

**Date handling:** `occurredAt` is a UTC timestamp (an instant — when the action was
taken). Maintenance `performedAt` remains a timezone-free `YYYY-MM-DD` calendar date
as defined in [maintenance-record.md](./maintenance-record.md); it is display context
only and does not order the feed.

## Edge Cases & Error States

| Scenario                                                      | Expected Behavior                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| No valid session                                              | API returns 401; client redirects to `/login` via the shared API client                                                       |
| Caller has no activity yet                                    | API returns an empty entry list and empty filter facets; client shows an empty state                                          |
| Filter combination matches no entries                         | API returns an empty entry list; filter facets still reflect full history; client shows a filtered-empty state (not an error) |
| Filter `assetId` the caller cannot access or has no entries   | Empty entry list; no error and no existence leak                                                                              |
| Teammate shares an asset with the caller's team               | The shared asset's entries appear in the caller's feed and asset filter facet — including entries predating the share         |
| A teammate performs an action on a shared asset               | One entry, attributed to that teammate as the actor, visible to every member who can access the asset                         |
| The caller's shared-asset access is revoked (unshare / leave) | On the next request the asset's entries no longer appear in the caller's feed or facets — evaluated against current sharing   |
| Actor of an entry later changes their display name            | Past entries keep the attributed name as it was when the action occurred (entries are immutable snapshots)                    |
| `type` is not a valid enum value                              | 422 validation error                                                                                                          |
| `assetId` is not a valid UUID                                 | 422 validation error                                                                                                          |
| `limit` is out of range                                       | 422 validation error                                                                                                          |
| `cursor` is malformed or no longer valid for the filter set   | 422 validation error                                                                                                          |
| Completing a scheduled task by logging work                   | Exactly one `task_completed` entry; never a duplicate `maintenance_logged` entry for the same record                          |
| Logging ad-hoc maintenance (no `taskId`)                      | One `maintenance_logged` entry                                                                                                |
| A task referenced by an entry is later deleted                | The entry remains and renders from its snapshot                                                                               |
| An asset referenced by entries is later archived              | Entries remain; the asset still appears in the asset filter facet                                                             |
| Two actions share the same `occurredAt`                       | Deterministic order via the secondary tiebreak; no flicker or duplication across pages                                        |
| The activity-log delivery or write fails for an action        | The user's action still succeeds; the event is durably captured and retried until written — the entry is not dropped          |
| Actions taken before the feature launched                     | Not present (no backfill)                                                                                                     |
| New activity occurs while the user is viewing the feed        | Appears on the next fetch/refresh; the feed is not real-time                                                                  |
| Non-401 API error (e.g. 500)                                  | Client shows a feed-level error state with retry                                                                              |

## Telemetry

**Request telemetry:** `GET /api/activity` maps to a new `ListActivity` operation via
`createTechnicalTelemetryMiddleware`. Implementing the endpoint requires adding this
route to the operation-name mapping in `technicalTelemetry.ts` and updating the
Operation Name Mapping table in [telemetry.md](../cross-cutting/telemetry.md).
A route shipped without a mapping entry falls through to `Unknown` and is invisible in
telemetry (telemetry.md anti-pattern), so the mapping must land with the route.

**Domain events:** None new. History does not publish a domain event — reads do not
produce events, and the feature emits nothing. It **consumes** the existing events
(`AssetCreated`, `MaintenanceRecordCreated`, `MaintenanceTaskCreated`,
`MaintenanceTaskAdvanced`, `MaintenanceTaskDeleted`), persisting one entry per action to
its own durable store. Those events are enriched per
[ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md) so the consumer
projects each entry without reading D1.

Delivery is durable, not best-effort (see Flags, per
[ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)): History
is a queue consumer fed from the producer-side outbox at least once, distinct from the
telemetry handlers, which stay on the in-process best-effort path and continue to write only
non-PII fields to Analytics Engine. The enrichment does not change what telemetry writes.

**Beyond request telemetry:** No additional measurement is required for v1. Filter
usage and feed engagement are not instrumented.

## Flags

**REVIEW NEEDED — `S1` boxes not yet reconciled with shipped code:** The base History
feature (`S1`) is implemented on `main` — `GET /api/activity`, the durable log + queue
consumer, and the `/app/history` page, with a test suite (`D1ActivityLogRepository.test.ts`,
`ActivityQueueConsumer.test.ts`, `AppActivityHistory.test.tsx`). Its acceptance boxes were
authored before box-discipline and are still `[ ]`. A brownfield pass (`/spec-author`) should
tick each `S1` box a test on `main` actually covers and unpick any that aren't yet true. The
spec is marked `in-progress` — `S1` shipped in code, `S2` (#73) pending — on that basis, rather
than left at `review`. Owner: engineering.

**DECISION — Completion is one entry (confirm):** Completing a scheduled task fires
both `MaintenanceTaskAdvanced` and `MaintenanceRecordCreated`. This spec collapses
them into a single `task_completed` entry so one user action is one row. If product
later wants both the "logged" and "completed" facets visible, revisit.

**DECISION — Durable delivery via a transactional outbox ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)):**
History must not drop actions, so it does not ride the best-effort in-process bus. Each
tracked event is written to a producer-side **outbox** in the _same atomic D1 transaction_
as the domain change — so an event is persisted if and only if its action is. A relay then
delivers outbox rows to the History queue **at least once** (on the request tail, with a
scheduled sweep as the backstop for rows whose in-request relay did not run). The consumer
is **idempotent**: it writes each entry under a unique constraint on the source event id
(insert-or-ignore), so an at-least-once redelivery can never create a duplicate. A message
that exhausts its retries lands in the queue's dead-letter queue and is persisted durably (a
`dead_letters` record) rather than left to expire, so a poison event is captured for manual,
idempotent-safe replay — not silently lost. Net effect:
every action appears in History exactly once, capture never blocks or fails the user's
action, and there is no silent-gap trade-off. Built this way from the start — no best-effort
interim.

**DECISION — Smart Events; History is a pure projection ([ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md)):**
The five tracked events are enriched to carry the state and producer-owned conclusions a
durable consumer needs, and the History consumer writes each entry **directly from the
event** — no read-back to D1:

- Every tracked event carries the asset snapshot (`name`, `type`) it relates to. The asset
  name is cross-aggregate, so the use case — which already loads the asset — supplies it
  when the event is published; it is never read inside an aggregate (ADR-0003).
- Each maintenance event carries its own descriptive `title`
  (`MaintenanceRecordCreated`, `MaintenanceTaskCreated`, `MaintenanceTaskAdvanced`,
  `MaintenanceTaskDeleted`). Carrying `title` on `MaintenanceTaskDeleted` is what lets a
  `task_deleted` entry render after the task row is gone (`DELETE FROM maintenance_tasks`).
- Each tracked event carries a producer-owned `activityEntryType` conclusion. For
  static one-to-one mappings this is the event's fixed activity type; for
  `MaintenanceRecordCreated` it is `maintenance_logged` when the record itself should
  appear in History, or `null` when a paired `MaintenanceTaskAdvanced` already represents
  the user action as `task_completed`. The durable projection never infers that from
  `taskId`.
- Each tracked event carries the **actor's display name** alongside `actorId`, so the
  projection can attribute a teammate's action ("logged by Sam") without reading the
  `user` table back. Like the asset name, the display name is cross-aggregate and is
  supplied by the use case when the event is published, never read inside an aggregate
  (ADR-0003). It is snapshotted on the entry, so it reflects who acted at the time.

This holds ADR-0009's line: events carry domain state and conclusions, never presentation
copy — the client still formats relative dates and labels.

Telemetry handlers stay **thin selective readers**: the enriched fields are not added to
their Analytics Engine writes, so the telemetry data-point contracts and their `v1` schema
in [telemetry.md](../cross-cutting/telemetry.md) are unchanged and no PII enters Analytics
Engine.

**DECISION — Actor attribution is exposed (teams):** Entries record an `actorId` (who
acted) distinct from `ownerId` (whose fleet). With sharing ([teams-foundation.md](./teams-foundation.md))
these diverge whenever a teammate acts on a shared asset, so the read model now returns
the actor as a display name plus a stable id — the client renders "you" for the caller's
own actions and the teammate's name otherwise. To keep History a pure projection with no
read-back (ADR-0010), the tracked events carry the actor's **display name** alongside
`actorId`; the projection snapshots it, so the attributed name reflects who acted at the
time (an actor's later rename does not rewrite past entries). Telemetry handlers stay thin
and must **not** write the actor display name (PII) to Analytics Engine — only the
non-PII `actorId` / `ownerId` ids and counts, consistent with the Smart Events decision
below. This resolves the previously reserved actor-vs-owner field.

**FOLLOW-UP — Reference docs at implementation time:** Adding the durable store
introduces a new table and a new branded id (an activity-entry id). Update
[data-model.md](../../reference/data-model.md) (storage mapping, branded value
objects, the consumer, the enriched event payloads (all five tracked events per
ADR-0010), and the currently stale domain-events table) and add the web screen to
[`docs/web/FEATURES.md`](../../web/FEATURES.md) when built. Regenerate the OpenAPI
document from the new Zod route spec.

## Out of Scope

- Editing or deleting history entries (History is read-only and append-only)
- Backfilling pre-launch assets, records, or tasks into the feed
- A per-asset activity tab and a dashboard "recent activity" widget — v1 is the
  global page only
- Profile/account events (name changes, account creation) and sign-in events in the
  feed
- Asset archive/unarchive as tracked actions (no domain event exists yet)
- Multi-select filters, date-range filters, and API-backed free-text search of history
- Real-time/live updates (the feed refreshes on fetch, not via push)
- Exporting history (CSV, PDF, etc.)
- Undo/restore actions from History
- Activity digests or notifications
- Activity for assets **not** shared with the caller — team visibility is limited to
  assets the caller can currently access (owned or shared to their team); there is no
  org-wide or all-members feed
- A dedicated per-teammate activity view or filtering the feed **by actor** — attribution
  is displayed per entry, but actor is not a filter dimension in this version
- A separate per-asset activity tab — the global page (optionally filtered by `assetId`)
  remains the only surface

## Open Questions

- [ ] Exact page size (default and maximum) and cursor encoding — implementer's call
      within the bounds above — engineering — resolve during implementation
- [ ] Whether the asset filter facet should visually distinguish archived assets from
      active ones — design — resolve during web design
