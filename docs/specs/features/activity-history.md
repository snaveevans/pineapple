---
name: activity-history
description: A durable, cross-asset timeline of the actions an owner-operator has taken — assets added, maintenance logged, and tasks scheduled, completed, or removed — filterable by action type and asset
metadata:
  type: feature
---

# Activity History

**Status:** draft
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-06-22
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [create-asset.md](./create-asset.md), [maintenance-record.md](./maintenance-record.md), [maintenance-task.md](./maintenance-task.md), [dashboard.md](./dashboard.md), [asset-library.md](./asset-library.md)

---

## Summary

Activity History gives an authenticated owner-operator a single, dedicated screen
that answers "what have I done?" — a reverse-chronological, cross-asset record of
the meaningful actions they have taken: adding an asset, logging maintenance,
scheduling a service task, completing a scheduled task, and removing a task. It is
distinct from the per-asset maintenance log ([maintenance-record.md](./maintenance-record.md),
which is one asset's service history) and from the [dashboard](./dashboard.md)
(which is forward-looking — what's due). History is backward-looking and spans
every asset.

History is backed by a **durable activity log**: a new consumer of the existing
domain-event stream persists each action to its own store, separate from the
telemetry handlers. This is deliberate — telemetry's Analytics Engine datasets are
sampled and retained only three months and are explicitly not an audit log
([telemetry.md](../cross-cutting/telemetry.md) anti-patterns). History needs an
exact, durable record, so it does not read from telemetry.

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
- **System actor: activity-log consumer** — a durable subscriber to the domain-event
  bus that writes one entry per tracked action, parallel to the telemetry handlers.
- **Future: team member / delegate** — a second person acting on the same fleet.
  Out of scope for v1, but entries record an `actorId` distinct from the owner so
  multi-actor attribution is possible later (see Flags).

## User Stories

- As an **authenticated owner-operator**, I can **open a dedicated History page and
  see a reverse-chronological feed of the actions I've taken across all my assets**
  so that **I can recall what I've done without opening each asset one by one**
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

## What Counts as Activity

Each tracked action becomes exactly one history entry. The five entry types and the
existing domain events that drive them:

| Entry type           | User action                                  | Source domain event(s)                                                                                                                          |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset_added`        | Added an asset                               | `AssetCreated`                                                                                                                                  |
| `maintenance_logged` | Logged ad-hoc maintenance (no task advanced) | `MaintenanceRecordCreated` not accompanied by a `MaintenanceTaskAdvanced` for the same record                                                   |
| `task_completed`     | Completed a scheduled task by logging work   | `MaintenanceTaskAdvanced`, published alongside a `MaintenanceRecordCreated` for the same `maintenanceRecordId` — the pair is one entry, not two |
| `task_scheduled`     | Scheduled a maintenance task                 | `MaintenanceTaskCreated`                                                                                                                        |
| `task_deleted`       | Removed a maintenance task                   | `MaintenanceTaskDeleted`                                                                                                                        |

Not tracked in v1: asset archive/unarchive (no domain event exists), profile/account
changes, and sign-in events. See Out of Scope.

> **Two small event changes are decided (see Flags).** The tracked events carry IDs,
> types, and dates but no display strings, and `MaintenanceRecordCreated` has no
> `taskId`. Because tasks are hard-deleted, a `task_deleted` entry cannot be
> reconstructed later — so `MaintenanceTaskDeleted` carries the task title. The
> consumer resolves the rest (asset name/type, titles) by lookup at write time, since
> assets and records are never hard-deleted.

## Source, Durability & Lifecycle

These are behavioral guarantees, not storage prescriptions:

- **Starts empty.** There is no backfill of pre-launch data. History contains only
  actions taken after the feature is live; entries created before the feature
  existed do not appear.
- **Durable and complete for the life of the account.** Entries are not sampled and
  do not expire. The feed reflects the full record, not a time-limited or sampled
  window. (This is why History does not read from telemetry's Analytics Engine
  datasets.)
- **Best-effort capture.** The activity-log consumer behaves like the telemetry
  consumers: a failure to write an entry is logged server-side and swallowed. It
  **never** blocks, delays, or fails the user's underlying action. In a rare failure
  an action may not appear in History; this is an accepted trade-off for v1 (see
  Flags).
- **Self-contained entries.** Each entry captures enough snapshot context at write
  time (the asset's name and type, the relevant title, the performed date) to render
  on its own. An entry remains fully readable after its underlying task is deleted or
  its asset is archived — it never renders as "unknown" and never disappears.
- **Immutable.** Entries are append-only. Renaming an asset later does not rewrite
  past entries (they reflect what was true when the action happened); History has no
  edit or delete capability.
- **Ordered by when the action happened in the app** (`occurredAt`). For maintenance
  entries the maintenance `performedAt` date is carried as display context but does
  not reorder the feed.

## API Requirements

### Read model

- [ ] Add `GET /api/activity` as a protected application API endpoint
- [ ] The endpoint uses the resolved authenticated `User.id` as the ownership input;
      no `ownerId` is accepted from the request
- [ ] The response returns the caller's activity in a single read model containing:
      the page of entries, the available filters with counts, and a pagination cursor
- [ ] Only the caller's own activity is ever returned; the response never exposes
      another user's entries, `ownerId`, or auth-provider identifiers
- [ ] Entries are returned newest first by `occurredAt`, with a stable secondary
      tiebreak (e.g. entry id) so equal timestamps have a deterministic order
- [ ] Each entry includes: a stable `id`, an entry `type` (one of `asset_added`,
      `maintenance_logged`, `task_completed`, `task_scheduled`, `task_deleted`),
      `occurredAt`, and an asset snapshot (`id`, `name`, `type`) sufficient to render
      the row without an additional lookup
- [ ] Maintenance-related entries (`maintenance_logged`, `task_completed`,
      `task_scheduled`, `task_deleted`) include the relevant title snapshot, and
      `maintenance_logged` / `task_completed` include the `performedAt` date
- [ ] Completing a scheduled task by logging work produces exactly one
      `task_completed` entry; it never also produces a separate `maintenance_logged`
      entry for the same record
- [ ] Logging maintenance that is not linked to a task produces one
      `maintenance_logged` entry
- [ ] Entries for deleted tasks and archived assets are still returned and fully
      renderable from their snapshot

### Filtering (server-side)

- [ ] The feed can be filtered by action `type` and by `assetId` via query
      parameters; the two combine (logical AND)
- [ ] Filtering is performed server-side against the durable log — unlike the asset
      library and dashboard, the client does not filter a pre-loaded set, because the
      feed is unbounded and paginated
- [ ] The response includes `availableFilters`: the set of action types present in
      the caller's history with a count for each, and the set of assets present in the
      caller's history (`id`, `name`, `type`) with a count for each
- [ ] Filter facet counts are computed over the caller's **complete** history, not
      the currently filtered view, so the user can pivot between filters (the same
      principle as the library's category counts in [asset-library.md](./asset-library.md))
- [ ] Assets that appear in history but are now archived are still listed in the
      asset filter facet, because they still have history
- [ ] A filter for an `assetId` the caller does not own, or that has no entries,
      returns an empty entry list (not an error and not a leak of existence)
- [ ] v1 supports a single value per filter dimension (one type and/or one asset);
      multi-select, date ranges, and free-text search are out of scope

### Pagination

- [ ] The endpoint is cursor-paginated; the response returns a `nextCursor` when more
      entries exist and a null/absent cursor when the caller has reached the end
- [ ] The client requests the next page by passing the returned cursor; the cursor is
      opaque to the client
- [ ] A bounded page size applies (default and maximum defined at the Zod edge; the
      maximum keeps a single response within Analytics Engine / Worker limits and a
      reasonable payload size)
- [ ] Active filters are preserved across pages (the cursor is valid only within the
      same filter set, or the filter params are re-sent alongside the cursor)

## Validation & Ownership

**Authentication:** Available only to authenticated users. A missing or invalid
session returns 401 through the shared authentication middleware; the web client
redirects to `/login` at the API-client layer.

**Permissions:** Activity is scoped entirely by the resolved `User.id`. Queries
filter by owner. The response must never expose another user's entries, `ownerId`,
or auth identifiers. There are no mutation endpoints — History is read-only — so
there is no write-side ownership or 403-on-modify path.

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
| Filter `assetId` is not owned by the caller or has no entries | Empty entry list; no error and no existence leak                                                                              |
| `type` is not a valid enum value                              | 422 validation error                                                                                                          |
| `assetId` is not a valid UUID                                 | 422 validation error                                                                                                          |
| `limit` is out of range                                       | 422 validation error                                                                                                          |
| `cursor` is malformed or no longer valid for the filter set   | 422 validation error                                                                                                          |
| Completing a scheduled task by logging work                   | Exactly one `task_completed` entry; never a duplicate `maintenance_logged` entry for the same record                          |
| Logging ad-hoc maintenance (no `taskId`)                      | One `maintenance_logged` entry                                                                                                |
| A task referenced by an entry is later deleted                | The entry remains and renders from its snapshot                                                                               |
| An asset referenced by entries is later archived              | Entries remain; the asset still appears in the asset filter facet                                                             |
| Two actions share the same `occurredAt`                       | Deterministic order via the secondary tiebreak; no flicker or duplication across pages                                        |
| The activity-log write fails for an action                    | The user's action still succeeds; the failure is logged server-side; the entry may be absent (best-effort)                    |
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
produce events, and the feature emits nothing. It **consumes** the existing event
stream: a new durable activity-log consumer subscribes to `AssetCreated`,
`MaintenanceRecordCreated`, `MaintenanceTaskCreated`, `MaintenanceTaskAdvanced`, and
`MaintenanceTaskDeleted`, persisting one entry per action to History's own durable
store. This consumer is registered alongside — and independently of — the telemetry
handlers in `registerDomainTelemetry`; an existing event therefore has both a
telemetry subscriber (Analytics Engine) and the History subscriber (durable store),
and a failure in one does not affect the other (per-handler error isolation in
`InMemoryEventBus`).

**Beyond request telemetry:** No additional measurement is required for v1. Filter
usage and feed engagement are not instrumented.

## Flags

**DECISION — Completion is one entry (confirm):** Completing a scheduled task fires
both `MaintenanceTaskAdvanced` and `MaintenanceRecordCreated`. This spec collapses
them into a single `task_completed` entry so one user action is one row. If product
later wants both the "logged" and "completed" facets visible, revisit.

**DECISION — Best-effort capture (acknowledged gap):** Consistent with the event bus
swallowing handler failures, a failed activity write is logged and dropped rather than
retried or made transactional. This can, rarely, leave a gap with no user-facing
error. Revisit (e.g. transactional write or an outbox) if gaps are observed in
practice.

**DECISION — Minimal event enrichment, snapshot the rest by lookup:** The durable log
needs display strings the domain events don't carry (asset name/type, record/task
titles) and a way to tell a completion from ad-hoc work. Because the events are
in-process and never persisted, changing their shape is a contained refactor. The
chosen v1 approach is the smallest correct change:

- `MaintenanceTaskDeleted` gains the task `title` — the only field that cannot be
  recovered later, because tasks are hard-deleted (`DELETE FROM maintenance_tasks`).
- `MaintenanceRecordCreated` gains `taskId` — so a record that completed a task is
  recognized as a single `task_completed` entry without correlating two events.
- The History consumer snapshots the remaining display data (asset name/type, and the
  record or task title for non-delete entries) by reading the still-existing entities
  at write time, since assets are archived (never deleted) and records are never
  deleted.

These new event fields are **not** added to the telemetry handlers' writes, so the
telemetry data-point contracts and their `v1` schema in
[telemetry.md](../cross-cutting/telemetry.md) are unchanged and no PII enters Analytics
Engine.

**Tradeoff (revisit later):** snapshot-by-lookup adds a D1 read on the event-handling
path (roughly one per entry written). This is accepted for v1 given the two-person
fleet. When we revisit performance and D1 read/write cost, the optimization is to
thread the display fields onto the events from the use cases — which already load the
asset — eliminating the lookups at the cost of denormalizing display data onto the
shared events (and the discipline of keeping it out of telemetry writes).

**RESERVED — Actor vs. owner:** Entries record an `actorId` (who acted) distinct from
`ownerId` (whose fleet). Today they are always equal (the same constraint noted in
[telemetry.md](../cross-cutting/telemetry.md) Known Issues). The field is reserved so
that, when team membership/delegation lands, History can attribute "who did this"
without a schema change. v1 does not display a separate actor.

**FOLLOW-UP — Reference docs at implementation time:** Adding the durable store
introduces a new table and a new branded id (an activity-entry id). Update
[data-model.md](../../reference/data-model.md) (storage mapping, branded value
objects, the consumer, the enriched `MaintenanceTaskDeleted` / `MaintenanceRecordCreated`
payloads, and the currently stale domain-events table) and add the web screen to
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
- Multi-select filters, date-range filters, and free-text search of history
- Real-time/live updates (the feed refreshes on fetch, not via push)
- Exporting history (CSV, PDF, etc.)
- Undo/restore actions from History
- Activity digests or notifications
- Cross-user or team-wide activity visibility (single-owner scope in v1)

## Open Questions

- [ ] Exact page size (default and maximum) and cursor encoding — implementer's call
      within the bounds above — engineering — resolve during implementation
- [ ] Whether the asset filter facet should visually distinguish archived assets from
      active ones — design — resolve during web design
