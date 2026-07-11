---
name: teams-foundation
description: The foundation for teams — creating a team, the membership model, and sharing/unsharing individual assets so members can see and edit them
metadata:
  type: feature
---

# Teams Foundation

**Status:** review
**Owner:** [unknown — assign on review]
**Last Updated:** 2026-07-03
**Related Specs:** [ADR-0015](../../decisions/0015-teams-as-opt-in-sharing-scope.md), [authentication.md](../cross-cutting/authentication.md), [permissions.md](../cross-cutting/permissions.md), [validation.md](../cross-cutting/validation.md), [error-handling.md](../cross-cutting/error-handling.md), [loading-states.md](../cross-cutting/loading-states.md), [telemetry.md](../cross-cutting/telemetry.md), [asset-library.md](./asset-library.md), [dashboard.md](./dashboard.md), [app-search.md](./app-search.md)

---

## Summary

This feature introduces **teams** as an opt-in sharing scope on top of the existing
per-user ownership model (see [ADR-0015](../../decisions/0015-teams-as-opt-in-sharing-scope.md)).
Today every asset is private to the user who created it. This spec lets a user
**create a team**, and lets an asset's owner **share individual assets to that team**
so that the team's members can see and help maintain them. Everything a user does not
explicitly share stays personal and private, exactly as before.

It is deliberately the **foundation** — the sharing mechanism — not the whole team
experience. It defines what a team is, what membership grants, and how sharing works,
but it does **not** cover how a second person joins a team (invitations) or how a team
is administered (removing members, leaving, transferring, renaming, deleting). Those are
separate specs. Until the invitations spec lands, a team has exactly one member — its
creator — so sharing is fully functional but not yet observable by a second person. This
is the intended land-the-mechanism-first sequencing.

This feature has a web UI (a create-team affordance, a per-asset share/unshare control,
and a "my team" view). UX intent for those screens belongs in
[`docs/web/FEATURES.md`](../../web/FEATURES.md); the implemented API contract is
authoritative in `openapi.json`.

## User Stories

- As a **user with no team**, I can **create a team and give it a name** so that **I have a shared space to put assets in**
- As an **asset owner**, I can **share one of my assets to my team** so that **its members can see and help maintain it**
- As an **asset owner**, I can **unshare an asset** so that **it becomes private to me again**
- As a **team member**, I can **see and edit the assets shared with my team** so that **I can help maintain them as if they were my own**
- As a **team member**, I can **view my team and who belongs to it** so that **I know who I'm sharing with**
- As a **user already in a team**, I am **prevented from creating a second team** so that **the one-team-per-user rule holds**
- As a **non-owner member**, I am **prevented from changing an asset's sharing** so that **only the asset's owner controls whether it is shared**

## Acceptance Criteria

**Team creation**

- [x] An authenticated user who belongs to no team can create a team by providing a **name**; on success they become the team's **owner** and its only member
- [x] Creating a team when the requester already belongs to a team (as owner or member) fails with **409 Conflict** and no team is created
- [x] The team name is **required**, trimmed, and at most **100 characters** (matching `DISPLAY_NAME_MAX_LENGTH`); it need not be unique. An invalid name fails with **422** before any team is created
- [x] A new team starts with exactly one membership: the creator, with role `owner`

**Reading your team**

- [x] A member can read their own team, including its name and the list of members with each member's display name and role
- [x] A user who belongs to no team gets an explicit "no team" result (not an error), so the client can render a create-team prompt

**Sharing & unsharing (asset-owner only)**

- [ ] The **owner of an asset** can share that asset to the team they belong to; after sharing, the asset is visible and editable to every member of that team
- [ ] Sharing requires the requester to belong to a team; sharing when the requester has no team fails with a **409 Conflict** (there is nothing to share into)
- [ ] Only the asset's owner may share or unshare it — a member who does not own the asset attempting to change its sharing fails with **403 Forbidden**
- [ ] The asset owner can unshare a shared asset, returning it to **personal**; members immediately lose access
- [ ] Sharing an asset that is already shared to the caller's team is an idempotent success (no duplicate, no error); unsharing an already-personal asset is an idempotent success
- [ ] "Owner" here means the **asset's** owner (`ownerId`), which may be any team member — not necessarily the team's owner. Any member can share the assets **they** own

**Member access to shared assets (full parity)**

- [ ] A team member can read an asset shared with their team and all of its dependent records (maintenance tasks, maintenance records, activity)
- [ ] A team member can perform the same **write** actions on a shared asset that its owner can — the maintenance actions that exist today: adding and deleting maintenance tasks, and logging maintenance records — with the sole exceptions of changing its sharing and deleting the asset itself, which remain asset-owner-only
- [ ] Access to a shared asset's dependent records **follows the asset**: authorization for maintenance/record/activity operations is determined by whether the requester can access the parent asset (owns it, or is a member of the team it is shared with), replacing the direct `ownerId === requesterId` check on those operations
- [ ] When an asset is unshared, or a member's access otherwise ends, subsequent requests by that member for the asset or its records behave as if the asset does not exist for them

**Read-path integration**

- [ ] Every list of "the user's assets" — the asset library (`GET /api/assets`), the dashboard, and search — returns both the requester's own assets (personal and shared-by-them) **and** the assets shared to the requester's team by others
- [ ] Each asset in a read model carries a computed **`sharing`** descriptor (computed server-side per ADR-0009, not derived by the client): its scope (`personal` or `team`) and whether the requester is its owner; for an asset shared **with** the requester by someone else, it also identifies the owner (e.g. owner display name) so the member can see whose asset it is
- [ ] Per-category counts and any other aggregate read-model figures are computed over the full visible set (owned + shared-with-me), so counts and lists stay consistent

**Permissions extension**

- [ ] The single-resource access rule is extended: a request for an asset (or its children) succeeds if the requester **owns it** _or_ **is a member of the team it is shared with**; otherwise the existing not-owned behavior applies
- [ ] The collection query is extended to include team-shared assets in addition to owned ones; it must never return an asset that is neither owned by nor shared with the requester
- [ ] [permissions.md](../cross-cutting/permissions.md) must be updated to document team visibility as an extension of the ownership model (per-user ownership remains the default; team sharing is additive)

## Edge Cases & Error States

| Scenario                                                      | Expected Behavior                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Create team while already in a team (owner or member)         | 409 Conflict; no team created                                                                  |
| Create team with empty/whitespace name                        | 422 Validation error mapped to the name field                                                  |
| Create team with an over-length name                          | 422 Validation error mapped to the name field                                                  |
| Read "my team" when the user has no team                      | 200 with an explicit "no team" result; client shows create-team prompt                         |
| Share an asset the requester does not own                     | 403 Forbidden (owner-only), or 404 if the asset is not visible to the requester at all         |
| Share an asset when the requester has no team                 | 409 Conflict (nothing to share into)                                                           |
| Share an asset already shared to the caller's team            | Idempotent success (no duplicate)                                                              |
| Unshare an asset that is already personal                     | Idempotent success                                                                             |
| Non-owner member tries to unshare a shared asset              | 403 Forbidden (only the asset owner controls sharing)                                          |
| Member reads/edits an asset shared with their team            | Succeeds; changes are visible to the owner and other members                                   |
| Member deletes a maintenance task on a shared asset           | Succeeds (full parity)                                                                         |
| Member tries to delete the shared asset itself                | Not permitted — asset deletion is asset-owner-only (and asset deletion is not yet implemented) |
| Request an asset shared to a team the requester is **not** in | Treated as not visible (see Flags: 403-vs-404 inherits the permissions.md known issue)         |
| Asset is unshared while a member has it open                  | The member's next request behaves as if the asset does not exist for them                      |
| Unauthenticated request to any endpoint here                  | 401 Unauthorized → client redirects to `/login`                                                |

## API Shape (design target)

The implemented contract is authoritative in `openapi.json` once built; this describes the
intended design, not a second source of truth. A user belongs to at most one team, so
sharing endpoints target the caller's team implicitly — no team id is supplied by the caller.

- **`POST /api/teams`** — create a team. Body: `{ "name": string }`. Auth required. Returns the created team: `{ id, name, ownerId, members: [{ userId, name, role }], createdAt }`. Errors: **409** (requester already in a team), **422** (invalid name), **401**.
- **`GET /api/teams/me`** — the caller's team with members, or an explicit empty result when the caller has no team (e.g. `{ "team": null }` with 200). Auth required. Errors: **401**.
- **`POST /api/assets/{assetId}/share`** — share the asset to the caller's team. Auth required. Asset-owner only. Idempotent. Errors: **403** (not the asset owner), **404** (asset not visible), **409** (requester has no team), **401**.
- **`DELETE /api/assets/{assetId}/share`** — return the asset to personal. Auth required. Asset-owner only. Idempotent. Errors: **403**, **404**, **401**.
- **Read models** — `GET /api/assets`, the dashboard, and search responses expand to include team-shared assets and add the computed `sharing` descriptor per asset (see Acceptance Criteria). This changes the response **shape** of existing endpoints (an added field and a wider result set), not their routes.

## Telemetry

**Request telemetry:** the new endpoints must be added to the operation-name mapping in
`technicalTelemetry.ts` and to [telemetry.md](../cross-cutting/telemetry.md):

- `POST /api/teams` → `CreateTeam`
- `GET /api/teams/me` → `GetMyTeam`
- `POST /api/assets/{assetId}/share` → `ShareAsset`
- `DELETE /api/assets/{assetId}/share` → `UnshareAsset`

Existing endpoints whose responses change (`GET /api/assets`, dashboard, search) keep their
current operation names.

**Domain events:** this feature introduces mutations, so it publishes domain events for
durable consumers (activity/History and future team-aware consumers), following Smart Events
(ADR-0010) — events carry the descriptive state a durable consumer needs (team name, asset
name, actor) so no consumer re-reads the source:

- `TeamCreated` — on team creation.
- `AssetSharedToTeam` — on share; carries asset id + name, team id + name, and actor.
- `AssetUnsharedFromTeam` — on unshare; same shape.

Each needs a telemetry handler and a dataset (`pineapple_team_domain_events` /
`pineapple_asset_domain_events`), with the full ordered `blobs[]`/`doubles[]` contract defined
in [telemetry.md](../cross-cutting/telemetry.md) using the `AssetCreated` table as the pattern.
Per ADR-0010, telemetry handlers stay thin selective readers: they record ids, roles, and
counts — **not** member emails or other PII — even though the domain event carries names for
the History projection. Reads (`GetMyTeam`, the expanded lists) publish no domain events.

## Flags

**DEFERRED — Reminder recipient for shared assets:** Maintenance reminders continue to go to
the **asset owner** only; team-wide reminder delivery for shared assets is not decided here.
Decide it in the notifications/invitations work, where the recipient set and notification
plumbing already live. Tracked in [#55](https://github.com/snaveevans/pineapple/issues/55).

**OUT OF SCOPE / FUTURE — Shared asset when its owner leaves the team:** A shared asset is
owned by one user but editable by the whole team. What happens to it when that owner leaves or
is removed (auto-unshare? reassign ownership? block removal?) is a **team-management** concern
and is not decided here. Resolve in the team-management spec; tracked in [#56](https://github.com/snaveevans/pineapple/issues/56).

**REVIEW NEEDED — 403 vs 404 for non-member single-resource access:** Requesting an asset
shared to a team the requester is not in inherits the unresolved 403-vs-404 question in
[permissions.md](../cross-cutting/permissions.md#known-issues). This spec follows the current
canonical behavior (403 for exists-but-forbidden) to match the rest of the app; the app-wide
switch to 404 is tracked in [#52](https://github.com/snaveevans/pineapple/issues/52), and this
spec will follow that decision once made.

**REVIEW NEEDED — Existing read specs must note shared assets:** [asset-library.md](./asset-library.md),
[dashboard.md](./dashboard.md), and [app-search.md](./app-search.md) describe "the user's own
assets." Once this lands they must be updated to state that team-shared assets also appear and
carry the `sharing` descriptor. Tracked in [#53](https://github.com/snaveevans/pineapple/issues/53).

## Out of Scope

- **Inviting or adding a second member** — the invitation/accept flow is the separate `invite-teammate` spec. Until it lands, a team has only its creator.
- **Team administration** — removing members, leaving a team, transferring ownership, renaming or deleting a team belong to the `team-management` spec.
- **Multiple teams per user / active-team switching** — a user has at most one team; multi-team is a future extension of ADR-0015, not this spec.
- **Team-wide reminder delivery** — see the deferred flag; reminders stay owner-directed for now.
- **Migrating existing assets** — none required; the model is additive and existing assets are simply personal until shared.
- **Sub-asset sharing** — sharing is per-asset; a single maintenance task or record cannot be shared independently of its asset.
- **Sharing to a team the requester does not belong to** — a user can only share into their own team.
