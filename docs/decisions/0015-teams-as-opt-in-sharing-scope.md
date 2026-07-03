# Teams as an Opt-In Sharing Scope

- Status: proposed
- Date: 2026-07-03

## Context and Problem Statement

Pineapple is described as a field-operations app for a two-person team, but the
access model does not reflect that. Every domain entity is owned by the `User`
who created it, repository queries filter by `ownerId = requesterId`, and a
single-resource fetch checks `entity.ownerId !== requesterId` (the model
documented in `docs/specs/cross-cutting/permissions.md`). The practical effect is
that each user is an **isolated island**: one teammate cannot see or act on the
other's assets. The shared-team premise only exists in the marketing copy.

The question is how to let teammates share work without disrupting what already
works. Two forces pull against each other. On one side, `ownerId` is threaded
through roughly fifty non-test files, so a model that redefines ownership is a
large, risky change to the entire codebase and to existing data. On the other,
users still want to keep some assets **to themselves** — not everything a person
tracks should become the team's. A tenancy model that forces every asset into a
team is both the most invasive option and a poor fit for how people actually
work.

This ADR chooses the least-invasive model that delivers real sharing while
preserving personal ownership.

## Decision Drivers

- **Fidelity to the product premise** — teammates must be able to genuinely share
  the assets they choose to.
- **Preserve personal, private assets** — a user must be able to keep assets
  visible only to themselves; sharing is a choice, not a default.
- **Minimize invasiveness** — avoid redefining the pervasive `ownerId` concept and,
  critically, avoid touching or migrating existing assets. Additive beats
  rewrite.
- **Consistency with the existing architecture** — sharing should be expressed as a
  domain concept and enforced at the same points ownership is today (repository
  query for collections, use case for single resources), per ADR-0002 and
  ADR-0003.
- **A clear authority model** — it must be unambiguous who can share an asset and
  who governs a team's membership.
- **Reversibility / future headroom** — the model should not foreclose richer
  arrangements (a user in several teams) if the product later needs them.

## Considered Options

- **A — Teams as an opt-in sharing scope on user-owned assets.** Ownership stays
  with the user. An asset is personal by default; its owner can share an
  individual asset to a team, making it visible and editable to that team's
  members. Teams are additive — no existing asset changes and there is no data
  migration.
- **B — Team as the sole ownership boundary, one team per user.** Owned entities
  belong to a `Team`; every user is a member of exactly one team; all of a user's
  existing assets are migrated into a personal team. (This was the previous draft
  of this ADR.)
- **C — Per-person sharing (ACL) on top of user ownership.** Keep `ownerId`; add a
  per-asset list of individual people it is shared with.
- **D — Status quo: single-tenant by user.** Change nothing.

## Decision Outcome

Chosen option: **A — Teams as an opt-in sharing scope on user-owned assets.**

Ownership stays exactly where it is: every asset is owned by the `User` who
created it, and `ownerId` remains the authoritative, unchanged boundary. On top of
that, a **team** is introduced as an optional sharing scope:

- An asset is **personal by default** — visible and editable only by its owner,
  identical to today's behaviour.
- The **owner can share an individual asset to a team**, which grants every member
  of that team read and write access to it. Only the owner can share an asset or
  return it to personal; team members may use a shared asset but cannot change its
  sharing.
- A user belongs to **at most one team** (and may belong to none — a user with no
  team simply has personal assets, as today). This model does not preclude
  multi-team membership later; that would extend it, not replace it.
- A team has an **owner** and **members**; the team owner governs membership and
  the team's lifecycle (covered by downstream feature specs).
- Access to a shared asset's dependent records (maintenance tasks, records,
  activity) **follows the asset** — visibility is determined by the asset's
  sharing, so those entities do not each need their own team association.

Because sharing is layered on top of ownership rather than replacing it,
**existing assets are untouched**: they are simply personal until an owner chooses
to share one. There is no ownership rewrite and no backfill migration.

Option A wins on the drivers that matter most here: it delivers real sharing while
keeping personal assets, and it is by far the least invasive — additive schema and
read-path changes instead of redefining ownership across ~50 files and migrating
all data. B was the previous choice and is now rejected precisely because it
forces every asset into a team (no personal assets) and requires the invasive
migration the user explicitly wants to avoid. C gives the finest granularity but
is the most leak-prone (every read path consults a per-asset grant list) and never
gives the team a shared identity — it models "my things I let specific people see"
rather than "our team's shared assets." D cannot deliver the feature.

This decision **extends** the ownership model in
`docs/specs/cross-cutting/permissions.md` rather than superseding it: per-user
ownership remains the default and is unchanged; this adds an optional team-sharing
scope on top. That spec will be updated to document team visibility alongside the
existing owner check. No existing ADR is contradicted; this builds on ADR-0002
(tactical DDD) and ADR-0003 (layer boundaries).

### Positive Consequences

- Teammates can genuinely share the assets an owner chooses to share, delivering
  the product premise.
- Users keep private, personal assets — nothing is forced into a team.
- The change is additive and non-invasive: existing assets, `ownerId`, and the
  existing ownership checks are untouched; there is no data migration. The
  foundation change is far smaller than a full tenancy rewrite.
- The domain already separates **who acted** (`actorId`) from **who owns**
  (`ownerId`) on its events, so activity and audit history distinguish which
  teammate acted on a shared asset with no additional modelling.
- Visibility of a shared asset's maintenance and records follows the asset, so
  those entities need no team association of their own.
- The model leaves room to grow into multi-team membership later without another
  tenancy decision.

### Negative Consequences

- Two visibility modes now coexist — personal and team-shared. Every read path that
  lists or fetches assets must account for both (assets I own + assets shared with
  my team), a permanent branch in access logic rather than a single uniform
  boundary.
- Sharing is per-asset and owner-driven; there is no bulk "everything belongs to
  the team." A user who wants most of their assets shared must share them one by
  one.
- One team per user is a real constraint for now; multi-team membership is
  deferred.
- Ownership and sharing become distinct concepts: a shared asset is owned by one
  user but editable by the whole team. What happens to a shared asset when its
  owner leaves the team is a lifecycle question this ADR does not answer and a
  downstream spec must.
- Semantics that were implicitly per-user must be re-decided for shared assets —
  notably who receives a maintenance reminder for a shared asset (its owner, or
  all members). This is a consequence to resolve in the feature specs.

## What this ADR does not decide (pushed down to specs)

To keep this record at decision altitude, the implementing mechanism is
deliberately excluded and belongs in the **Teams foundation** feature spec
(`docs/specs/features/`) and the updated permissions cross-cutting spec:

- The `teams` and `team_members` table shapes, the `TeamId` branded type, how an
  asset references the team it is shared with, and the `Team` / membership
  aggregate and repository signatures.
- The exact read-path queries that combine an owner's personal assets with the
  assets shared to their team.
- How team membership is resolved from the session and threaded to use cases.
- The share / unshare use cases and the precise point at which owner-only control
  is enforced.
- What happens to a shared asset when its owner leaves or is removed from the team.
- Which team members receive reminders for a shared asset.

Downstream feature specs (inviting a teammate; team management & roles) and the
reminder semantics above are separate concerns and are not decided here.

---

## Pros and Cons of the Options

### Option A — Teams as an opt-in sharing scope on user-owned assets _(chosen)_

- ✅ Good, because it delivers real sharing while preserving personal assets.
- ✅ Good, because it is additive — existing assets, `ownerId`, and current checks
  are untouched and there is no data migration.
- ✅ Good, because sharing stays a domain concept enforced at the same two points
  ownership is today (ADR-0002, ADR-0003).
- ✅ Good, because it gives the team a first-class identity and does not foreclose
  multi-team membership later.
- ❌ Bad, because two visibility modes (personal + team-shared) coexist, so every
  asset read path must account for both.
- ❌ Bad, because sharing is per-asset with no bulk "all mine is the team's."

### Option B — Team as sole ownership boundary, one team per user

- ✅ Good, because it yields a single uniform ownership boundary (team identity)
  with one rule to enforce.
- ❌ Bad, because it forces every asset into a team — there are no personal,
  private assets.
- ❌ Bad, because it requires redefining `ownerId` across ~50 files and migrating
  all existing data — exactly the invasive change to be avoided.

### Option C — Per-person sharing (ACL) on top of user ownership

- ✅ Good, because it allows the finest-grained sharing (this asset with this
  person) and preserves per-user ownership.
- ❌ Bad, because every read path must consult a per-asset grant list — the most
  leak-prone enforcement model.
- ❌ Bad, because it never gives the team a shared identity; it models "my things I
  let people see," not "our team's assets."

### Option D — Status quo: single-tenant by user

- ✅ Good, because it costs nothing and keeps the simplest possible access model.
- ❌ Bad, because it cannot deliver the feature — teammates remain unable to share,
  which is the entire premise of the product.
