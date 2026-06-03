---
audience: all contributors
purpose: canonical ownership and access model for feature specs
source: this file
date: 2026-06-02
---

# Permissions & Ownership — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features unless listed in Exceptions

---

## Summary

The access model is single-tenant by user: every domain entity is owned by the `User` who created it. No roles, groups, or ACL exist. Ownership is enforced in two layers — at the repository query for collections, and at the use case for single-resource access.

## Canonical Behavior

**Ownership assignment:** On creation, the authenticated `User.id` is stored as `ownerId` on the entity. This is set by the use case using the `requesterId` passed from the route handler; it is never accepted from the API caller.

**Collection access:** Repository queries always filter by `ownerId = requesterId`. An entity belonging to another user is invisible — it does not appear in lists and its existence is not revealed.

**Single-resource access:** Use cases fetch by ID, then explicitly check `entity.ownerId !== requesterId`. Current behavior:

- Entity exists, belongs to requester → proceed
- Entity exists, belongs to another user → `err(new ForbiddenError(...))` → 403
- Entity does not exist → `err(new NotFoundError(...))` → 404

Note: the 403 vs 404 response for wrong-owner access has not been explicitly decided. See Known Issues.

## Feature Integration Contract

Every feature spec must document:

- Whether the feature creates an owned entity, and confirm that `ownerId` is derived from the session `requesterId`, not the request body.
- Whether the feature reads a single owned entity, and confirm that the post-fetch ownership check is present.
- Whether the feature lists entities, and confirm that the repository query filters by `ownerId`.
- If the feature involves sharing, delegation, or multi-user access, it must explicitly note that the current model does not support this and describe the required extension.

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **Accepting `ownerId` from the request body:** Callers must never supply their own owner. The use case always derives it from the authenticated session.
- **Listing without an ownership filter:** Querying all entities without filtering by `ownerId` leaks cross-user data.
- **Returning 404 for forbidden single-resource access:** The canonical behavior is 403 for existence-but-forbidden. Returning 404 instead loses information and must be documented as an explicit exception if ever justified.

## Known Issues

- **403 vs 404 on wrong-owner single-resource access has not been decided.** The current code returns 403, which reveals that the entity exists but the requester cannot access it. An alternative is to return 404 unconditionally to avoid leaking existence. **Planned:** make a deliberate call, document the rationale here, and update the Canonical Behavior section accordingly.
- **Different enforcement mechanisms for collections vs single resources.** Collections filter at the repo-query level; single resources check post-fetch at the use-case level. Both enforce the same invariant but in different places — a new repository method could accidentally skip the ownership filter without a compile-time signal. **Planned:** consider making `ownerId` a non-optional parameter on all repo read methods so the constraint is impossible to omit.
- **Mutation ownership pattern not established.** Update and delete are not yet implemented. When added, they should follow the single-resource pattern (fetch → ownership check → mutate). This spec should be updated when the first mutation is added.
- **Archived resource visibility is inconsistent.** Collection queries filter out archived assets, but single-resource access by ID does not exclude archived entities. Whether an archived but owned asset should be readable via direct ID lookup has not been decided. **Planned:** define the access policy for archived resources and apply it consistently across both collection and single-resource access.
