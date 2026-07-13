---
audience: all contributors
purpose: canonical ownership and access model for feature specs
source: this file
date: 2026-07-11
---

# Permissions & Ownership — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features unless listed in Exceptions

---

## Summary

The access model is **per-user ownership by default**, with an optional **team sharing**
extension (see [ADR-0015](../../decisions/0015-teams-as-opt-in-sharing-scope.md) and
[teams-foundation](../features/teams-foundation.md)). Every owned entity has an
`ownerId` set at creation. Assets may additionally be shared to the owner's team,
which grants every team member read and write access to that asset and its
dependents. Personal (unshared) assets remain visible only to their owner.

---

## Canonical Behavior

**Ownership assignment:** On creation, the authenticated `User.id` is stored as
`ownerId` on the entity. This is set by the use case using the `requesterId`
passed from the route handler; it is never accepted from the API caller.

**Team sharing (assets):** An asset is personal by default (`sharedTeamId` null).
Only the **asset owner** may share it to the team they belong to, or unshare it
back to personal. Team members may use a shared asset but cannot change its
sharing. Sharing is opt-in and per-asset — there is no automatic team tenancy.

**Collection access:** Repository queries return entities the requester can see:

- **Owned:** `ownerId = requesterId`
- **Team-shared assets:** `sharedTeamId` is a team the requester belongs to

An entity that is neither owned nor team-shared is invisible — it does not appear
in lists and its existence is not revealed via collections.

**Single-resource access:** Use cases fetch by ID, then check access:

- Entity exists, requester **owns** it → proceed
- Entity exists, requester is a **member of the team it is shared with** → proceed
  (assets and dependents that follow the asset)
- Entity exists, requester has no access → `err(new ForbiddenError(...))` → 403
- Entity does not exist → `err(new NotFoundError(...))` → 404

**Dependents follow the asset:** Authorization for maintenance tasks, maintenance
records, and other child operations is determined by whether the requester can
access the **parent asset** (owns it or is a member of the team it is shared
with), not by a direct `ownerId === requesterId` check on the child. Child rows
still store `ownerId` as the asset owner for attribution; access does not require
the requester to match that field.

**Sharing mutations are asset-owner-only:** Share and unshare require
`asset.ownerId === requesterId`. A team member who can see a shared asset but
does not own it receives 403 when attempting to change sharing.

Note: the 403 vs 404 response for exists-but-forbidden access has not been
explicitly decided. See Known Issues. This app currently returns 403.

---

## Feature Integration Contract

Every feature spec must document:

- Whether the feature creates an owned entity, and confirm that `ownerId` is
  derived from the session `requesterId`, not the request body.
- Whether the feature reads a single owned entity, and confirm that the post-fetch
  access check is present (own **or** team-shared, as applicable).
- Whether the feature lists entities, and confirm that the repository query
  returns only visible entities (owned + team-shared where applicable).
- If the feature involves further sharing, delegation, or multi-user access
  beyond team-shared assets, it must explicitly note the extension required.

---

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

---

## Anti-Patterns

- **Accepting `ownerId` from the request body:** Callers must never supply their
  own owner. The use case always derives it from the authenticated session.
- **Listing without a visibility filter:** Querying all entities without filtering
  by ownership (and team sharing where applicable) leaks cross-user data.
- **Checking only `ownerId` on asset dependents:** After team sharing, maintenance
  and similar operations must use the asset-access check, not
  `child.ownerId === requesterId` alone.
- **Letting non-owners change sharing:** Only the asset owner may share or unshare.
- **Returning 404 for forbidden single-resource access:** The canonical behavior is
  403 for existence-but-forbidden. Returning 404 instead loses information and
  must be documented as an explicit exception if ever justified.

---

## Known Issues

- **403 vs 404 on wrong-owner single-resource access has not been decided.** The
  current code returns 403, which reveals that the entity exists but the
  requester cannot access it. An alternative is to return 404 unconditionally to
  avoid leaking existence. **Planned:** make a deliberate call, document the
  rationale here, and update the Canonical Behavior section accordingly. Tracked
  in [#52](https://github.com/snaveevans/pineapple/issues/52).
- **Different enforcement mechanisms for collections vs single resources.**
  Collections filter at the repo-query level; single resources check post-fetch
  at the use-case level. Both enforce the same invariant but in different places.
- **Asset deletion is not yet implemented.** When added, it should remain
  asset-owner-only (team members may edit shared assets but not delete them).
- **Archived resource visibility is inconsistent.** Collection queries filter out
  archived assets, but single-resource access by ID does not exclude archived
  entities. **Planned:** define the access policy for archived resources and
  apply it consistently.
