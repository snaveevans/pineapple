---
name: archive-asset
description: Promote asset archiving from a dormant field to a real action with a domain event, cascading in the application layer to suspend/reactivate the asset's maintenance tasks so durable consumers (notifications, history) react without reading the source back
metadata:
  type: feature
---

# Archive Asset

**Status:** `parked` — **deferred; out of scope for the current notifications work.** This is preserved design thinking, not active scope: it captures how archive _should_ behave when it graduates from a dormant `Asset.archivedAt` field to a real feature, so [notifications.md](../features/notifications.md) can consume its events then. To activate, move this file back to `docs/specs/features/` and add it to the active index in [SPECS.md](../SPECS.md).
**Owner:** product and engineering
**Last Updated:** 2026-07-02
**Related Specs:** [authentication.md](../cross-cutting/authentication.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [permissions.md](../cross-cutting/permissions.md), [telemetry.md](../cross-cutting/telemetry.md), [create-asset.md](../features/create-asset.md), [asset-library.md](../features/asset-library.md), [dashboard.md](../features/dashboard.md), [maintenance-task.md](../features/maintenance-task.md), [notifications.md](../features/notifications.md), [activity-history.md](../features/activity-history.md)

---

## Summary

Archiving takes an asset the owner no longer actively manages (sold, retired, decommissioned) out
of active rotation while preserving its history. Today "archived" exists only as a passive
`Asset.archivedAt` column that read paths filter on; there is no way to archive an asset through
the app and no signal when it happens. This spec makes **archive (and unarchive) a real domain
action that raises an event**, and — the reason it matters now — **cascades to the asset's
maintenance tasks in the application layer** so each task is suspended and raises its own event.

That cascade is what lets the [notifications](../features/notifications.md) durable scheduler, which is
event-driven and must never read maintenance-task or asset storage back
([ADR-0010](../../decisions/0010-smart-events-for-durable-consumers.md)), **cancel a pending
reminder when an asset is archived** — on the exact same handler path it already uses for
`MaintenanceTaskDeleted`. Unarchive is the mirror: tasks reactivate and the scheduler reschedules
from the carried `nextDue`.

The design principle is the one worked out with notifications: it is **not** a consumer's job to
join asset and task state to decide whether to act, and it is **not** a task's job to reach into
the Asset aggregate to discover it was archived. The **application layer** orchestrates the
cross-aggregate cascade (ADR-0003); each aggregate owns its own state transition and event.

## Current Behavior

- `Asset` carries `archivedAt: Date | null`, persisted by `D1AssetRepository` and returned in the
  asset API response — but the aggregate has **no `archive()`/`unarchive()` method** and raises
  **no event**. An asset can only become archived by an out-of-band DB write.
- "Exclude archived" is enforced **only in read paths**, never in an aggregate:
  `MaintenanceTaskRepository.findByOwnerForActiveAssets` joins `WHERE a.archived_at IS NULL`, and
  `GetDashboard` / `ListAssets` / `SearchAssets` filter `archivedAt === null` in the use case.
- `CreateMaintenanceTask` and `CreateMaintenanceRecord` guard with a 409 when the asset is archived.
- `MaintenanceTask` has **no lifecycle status**; it is unaware of archive.

## Personas

- **DIYer Dale, retiring an asset** — sold the truck; wants it out of the dashboard, library
  default view, and reminders, without losing its maintenance history.
- **DIYer Dale, restoring an asset** — archived something by mistake, or is re-commissioning it;
  wants it and its schedule back.
- **System: notifications scheduler** — must stop reminders for a suspended task and resume them on
  reactivation, without reading asset/task storage ([notifications.md](../features/notifications.md)).
- **System: activity-history projection** — could record archive/suspend as history entries once the
  events exist (today it lists asset archive as untracked precisely because no event exists — see
  [activity-history.md](../features/activity-history.md)).

## User Stories

- As **DIYer Dale**, I can **archive an asset** so that **it leaves my active fleet views and stops
  generating reminders, while its history is preserved**
- As **DIYer Dale**, I can **unarchive an asset** so that **it and its maintenance schedule return
  to active rotation**
- As a **system consumer**, I **learn about archive/unarchive through events carrying the state I
  need** so that **I react without reading the asset or task back**

## Behavior & Decisions

### Archive is an action on the Asset aggregate

- [ ] `Asset` gains `archive()` and `unarchive()`. `archive()` sets `archivedAt` and raises
      `AssetArchived`; `unarchive()` clears it and raises `AssetUnarchived`.
- [ ] Both are **idempotent** at the aggregate: archiving an already-archived asset (or unarchiving
      an active one) is a no-op that raises no event and triggers no cascade.

### The cascade is orchestrated in the application layer

- [ ] An `ArchiveAsset` use case archives the asset **and** loads that asset's maintenance tasks and
      calls `task.suspend()` on each; `UnarchiveAsset` calls `task.reactivate()` on each. Aggregates
      never reach across boundaries — the use case does the cross-aggregate work (ADR-0003).
- [ ] The asset state change and all task transitions commit **atomically** (one D1 transaction /
      batch), and their events are written to the producer-side outbox in the same batch, so a
      consumer sees the archive and the suspensions together or not at all
      ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)).

### Tasks gain a lifecycle status; nextDue is preserved

- [ ] `MaintenanceTask` gains a status (`active` / `suspended`) with `suspend()` / `reactivate()`
      transitions. **`nextDue` is not cleared** — suspension is orthogonal to the schedule, so
      unarchive restores the task cleanly rather than losing when it was due.
- [ ] A suspended task is excluded from active scheduling and active-fleet reads, and cannot be
      advanced or receive new records (the existing archived-asset guard becomes a task-status rule);
      it remains readable in the asset's own history.
- [ ] Each transition raises a **Smart Event** — `MaintenanceTaskSuspended` / `MaintenanceTaskReactivated`
      — carrying the asset snapshot (name/type) and task `title` those events already carry, plus the
      current `nextDue`, so durable consumers project/schedule without read-back.

### Consumers

- [ ] [notifications.md](../features/notifications.md): `MaintenanceTaskSuspended` → **cancel** the pending
      reminder (same path as `MaintenanceTaskDeleted`); `MaintenanceTaskReactivated` → **reschedule**
      from the carried `nextDue` (same path as `MaintenanceTaskAdvanced`).
- [ ] [activity-history.md](../features/activity-history.md) **may** add `asset_archived` / `task_suspended`
      entry types once these events exist; that adoption is a separate, optional change, not
      required by this spec.

## Validation & Ownership

**Authentication:** Archive/unarchive are available only to authenticated users; 401 otherwise.

**Permissions:** A user may archive/unarchive only their own assets. An unknown or foreign asset
returns 404 (existence not revealed); the same ownership rule governs the cascade — only the
owner's tasks are touched.

**Endpoints:** `POST /api/assets/{assetId}/archive` and `POST /api/assets/{assetId}/unarchive`,
returning the updated asset. Dedicated action routes make the cascade and events explicit. Zod
validates at the HTTP edge (ADR-0007) and the OpenAPI document is regenerated.

## Edge Cases & Error States

| Scenario                                          | Expected Behavior                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Archive an active asset with N tasks              | Asset archived; N tasks suspended; `AssetArchived` + N `MaintenanceTaskSuspended` events emitted                                           |
| Archive an already-archived asset                 | Idempotent no-op; no event, no cascade                                                                                                     |
| Unarchive an archived asset                       | Asset reactivated; its tasks reactivated; `AssetUnarchived` + `MaintenanceTaskReactivated` events                                          |
| Unarchive an already-active asset                 | Idempotent no-op                                                                                                                           |
| Archive/unarchive an unknown or foreign asset     | 404 (no existence leak)                                                                                                                    |
| Reactivated task's `nextDue` is now in the past   | Task returns overdue; notifications schedules a reminder that fires on the next sweep                                                      |
| Create task/record against an archived asset      | 409 (unchanged guard, now expressible as a task/asset-status rule)                                                                         |
| Consumer receives suspend/reactivate out of order | Resolved by event time/version, as with delete/advance ([ADR-0011](../../decisions/0011-reliable-event-delivery-via-cloudflare-queues.md)) |

## Telemetry

**Request telemetry:** `POST /api/assets/{assetId}/archive` → `ArchiveAsset`;
`POST /api/assets/{assetId}/unarchive` → `UnarchiveAsset`. Add both to the operation-name mapping in
`technicalTelemetry.ts` and [telemetry.md](../cross-cutting/telemetry.md).

**Domain events:** Four new events, each following the `AssetCreated` blob/double pattern in
[telemetry.md](../cross-cutting/telemetry.md) (thin telemetry writes non-PII ids/enums only; the
snapshot/title fields ride in the event payload and outbox message, never Analytics Engine):

- `AssetArchived` / `AssetUnarchived` — dataset `pineapple_asset_domain_events` (binding
  `ASSET_DOMAIN_TELEMETRY`).
- `MaintenanceTaskSuspended` / `MaintenanceTaskReactivated` — dataset
  `pineapple_maintenance_task_domain_events` (binding `MAINTENANCE_TASK_DOMAIN_TELEMETRY`), carrying
  `nextDue` on the enriched payload (not the telemetry blobs).

Full ordered `blobs[]`/`doubles[]` contracts are authored at implementation, following the pattern
of the existing `MaintenanceTask*` events.

## Implementation Requirements

- Add the task `status` column and migration.
- Update [data-model.md](../../reference/data-model.md) with Asset/MaintenanceTask fields, the four
  new events, and the `nextDue`-carrying task event payloads.
- Reflect archive/unarchive UX in [`docs/web/FEATURES.md`](../../web/FEATURES.md).
- Regenerate the OpenAPI document.

## Out of Scope

- **Hard-deleting an asset** — archive is reversible; permanent deletion (and its history handling)
  is a separate decision
- **Bulk archive / auto-archive** — one asset at a time; no rules-based or scheduled archiving
- **Retention or purge** of archived assets and their history
- **Suspending an individual task without archiving its asset** — task-level pause as a standalone
  user action is future work; here suspension is only a consequence of asset archive
- **Reminder, dashboard, or history behavior internals** — owned by their respective specs; this
  spec only provides the events they consume
- **Activity-history adoption** — [activity-history.md](../features/activity-history.md) lists asset
  archive as untracked because no event exists. These events unblock `asset_archived` /
  `task_suspended` entry types, but adding them is optional and not part of this parked design.

## Future Considerations

- Once tasks carry an explicit `active`/`suspended` status, active read paths can either keep the
  current archived-asset exclusion or migrate to `task.status = 'active'`. Correctness does not
  require the migration, but it would remove the implicit "archived implies excluded" rule from the
  read layer.
- Web design should decide whether suspended tasks appear greyed on the asset's own maintenance page
  or are hidden.
