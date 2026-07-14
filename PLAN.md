# PLAN: Teams remaining slices (stacked PRs)

> **Audience:** agents and humans implementing the teams epic  
> **Scope:** teams epic only (#62) — not `/verify-email`, #52, API chores #65–70, or #18  
> **Stacking:** GitHub Stacked PRs via [`gh stack`](https://github.github.com/gh-stack/)  
> **Last updated:** 2026-07-13

Check a box **only when that item is done on the branch/PR that lands it** (code + tests + any required OpenAPI/spec AC updates). Do not check from intent alone.

**Before implementing any layer:** open the **Spec** path(s) listed for that layer and implement only the AC that layer owns. Mark those AC boxes in the same PR.

---

## Task → spec map (source of truth)

| Layer | Issue | Spec(s) to implement against | Status of spec today |
| ----- | ----- | ---------------------------- | -------------------- |
| A1 | [#74](https://github.com/snaveevans/pineapple/issues/74) | [dashboard.md](docs/specs/features/dashboard.md) (`sharing` on fleet/queue), [app-search.md](docs/specs/features/app-search.md) (`sharing` on hits), [teams-foundation.md](docs/specs/features/teams-foundation.md) (read-path `sharing` descriptor AC) | draft / draft / review |
| A2 | [#59](https://github.com/snaveevans/pineapple/issues/59) | [teams-foundation.md](docs/specs/features/teams-foundation.md) (read-path UI intent), [asset-library.md](docs/specs/features/asset-library.md), [dashboard.md](docs/specs/features/dashboard.md), [app-search.md](docs/specs/features/app-search.md), web intent [FEATURES.md](docs/web/FEATURES.md) | review / review / draft / draft |
| B1 | [#73](https://github.com/snaveevans/pineapple/issues/73) | [activity-history.md](docs/specs/features/activity-history.md) (access + actor + filters), [teams-foundation.md](docs/specs/features/teams-foundation.md) (unchecked activity AC), [ADR-0010](docs/decisions/0010-smart-events-for-durable-consumers.md) | draft / review |
| C1–C5 | [#60](https://github.com/snaveevans/pineapple/issues/60) | **Author then implement:** [invite-teammate.md](docs/specs/features/invite-teammate.md) _(create in C1)_ · depends on [teams-foundation.md](docs/specs/features/teams-foundation.md), [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md), email [ADR-0012](docs/decisions/0012-transactional-email-via-cloudflare-email-sending.md) | not written yet |
| D1–D4 | [#61](https://github.com/snaveevans/pineapple/issues/61) | **Author then implement:** [team-management.md](docs/specs/features/team-management.md) _(create in D1)_ · resolves [#56](https://github.com/snaveevans/pineapple/issues/56) · depends on invite-teammate + teams-foundation | not written yet |
| Decision | [#55](https://github.com/snaveevans/pineapple/issues/55) | [notifications.md](docs/specs/features/notifications.md) (+ teams-foundation deferred flag) | active |
| Decision | [#56](https://github.com/snaveevans/pineapple/issues/56) | Recorded in **team-management.md** (D1); coded in D2+ | open decision |
| Epic | [#62](https://github.com/snaveevans/pineapple/issues/62) | [teams-foundation.md](docs/specs/features/teams-foundation.md), [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md), index [SPECS.md](docs/specs/SPECS.md) | review |

**Cross-cutting always in force** (do not re-spec; follow these):

- [authentication.md](docs/specs/cross-cutting/authentication.md)
- [permissions.md](docs/specs/cross-cutting/permissions.md)
- [validation.md](docs/specs/cross-cutting/validation.md)
- [error-handling.md](docs/specs/cross-cutting/error-handling.md)
- [loading-states.md](docs/specs/cross-cutting/loading-states.md)
- [telemetry.md](docs/specs/cross-cutting/telemetry.md)

**API contract:** generated OpenAPI (`docs/reference/openapi.json`) is authoritative for HTTP shapes once a layer lands; Zod route specs are the edit surface.

---

## Reality check

Core product features (dashboard, activity, search, notifications, maintenance, assets, profile) are **already on `main`**. Many unchecked AC boxes in specs are lifecycle drift, not missing code.

**Teams epic [#62](https://github.com/snaveevans/pineapple/issues/62)** is the remaining product track.

| Done | Remaining |
| ---- | --------- |
| #57 team + membership | **#74** sharing descriptor on dashboard + search |
| #58 asset share/access | **#73** shared activity + actor attribution |
| Create-team + share UI on maintenance | **#59** list-surface sharing badges |
| `sharing` on `GET /api/assets` | **#60** invite-teammate (spec + implement) |
| | **#61** team-management (spec + implement; resolves #56) |
| | **#55** reminder recipient decision (before multi-member reminders) |

### Out of scope for this plan

| Item | Related spec (if any) |
| ---- | --------------------- |
| Public `/verify-email` web page | [email-verification.md](docs/specs/features/email-verification.md) |
| #52 404-masking | [permissions.md](docs/specs/cross-cutting/permissions.md) Known Issue |
| API hygiene #65–#70 | (no feature spec) |
| #18 security dashboard | (no feature spec) |
| Parked archive-asset | [archive-asset.md](docs/specs/backlog/archive-asset.md) |

- [ ] _(do not implement under this plan)_ Public `/verify-email` web page
- [ ] _(do not implement under this plan)_ #52 404-masking for wrong-owner access
- [ ] _(do not implement under this plan)_ API hygiene #65–#70
- [ ] _(do not implement under this plan)_ #18 security dashboard
- [ ] _(do not implement under this plan)_ Parked archive-asset

---

## Dependency graph

```text
main
 ├─ Stack A (foundation finish)
 │   ├─ L1  #74  sharing descriptor (dashboard + search API)
 │   │      specs: dashboard.md, app-search.md, teams-foundation.md
 │   └─ L2  #59  web badges
 │          specs: teams-foundation.md + asset-library/dashboard/app-search + FEATURES.md
 │
 └─ Stack B (parallel with A)
     └─ L1  #73  shared activity + actor attribution
            specs: activity-history.md, teams-foundation.md, ADR-0010

main (after A+B merge) ── Stack C: invite-teammate.md (author → implement)
main (after C) ────────── Stack D: team-management.md (author → implement; #56)
                           #55 → notifications.md decision
```

**Why two parallel stacks for foundation leftovers:** #73 and #74 both only need #58 (done). Stacking #73 under #74 would create a false dependency. Stack A is the real dependent pair (#74 → #59).

---

## Prerequisites

- [ ] Confirm GitHub Stacked PRs (private preview) is enabled for this repo
- [ ] Install CLI: `gh extension install github/gh-stack`
- [ ] Optional alias: `gh stack alias` (`gs`)
- [ ] Start work from a clean, up-to-date `main`
- [ ] Prefer a **worktree per active stack** if working A and B in parallel

---

## Stacking workflow (`gh stack`)

```bash
gs init feat/<issue>-<slug>     # bottom layer, off main
# implement → commit (conventional commits + Co-Authored-By)
gs add feat/<issue>-<slug>     # next layer, base = previous branch
# implement → commit
gs push && gs submit           # push all branches, open PRs with correct bases
# after review: merge bottom → rest auto-rebase; or merge partial stack when CI is green
```

### Repo conventions (every layer)

- [ ] Branch name: `feat/{issue}-{slug}` (or `docs/{issue}-{slug}` for spec-only)
- [ ] PR body uses template; `Closes #N` only when this PR fully finishes the issue; else `Refs #N`
- [ ] PR **Spec / AC** section links the paths below and lists AC boxes checked
- [ ] Spec AC checkboxes: only mark boxes **this PR** lands, in the same PR
- [ ] Before open/push readiness: `pnpm lint && pnpm type-check && pnpm -r test`
- [ ] Regenerate OpenAPI when contract changes: `pnpm --filter @snaveevans/pineapple-api openapi:generate`
- [ ] One concern per layer (~40 files / ~800 net lines is a **split signal**, not a target)
- [ ] No drive-by refactors, no API hygiene, no archive work

### Per-PR checklist (copy into each PR work session)

- [ ] Opened the **Spec** path(s) for this layer (see Task → spec map)
- [ ] One-sentence scope named; stop if a second concern appears
- [ ] Tests for new behavior
- [ ] `pnpm lint && pnpm type-check && pnpm -r test`
- [ ] OpenAPI regen if API changed
- [ ] Spec AC checkboxes for **this** layer only
- [ ] PR: Summary / Related / Test plan / Spec (with paths)
- [ ] Commit messages: Conventional Commits + Co-Authored-By trailer

---

## Stack A — Read-model badges

### A1 — `feat/74-sharing-descriptor` · Closes #74

| | |
| --- | --- |
| **Issue** | [#74](https://github.com/snaveevans/pineapple/issues/74) |
| **Primary specs** | [docs/specs/features/dashboard.md](docs/specs/features/dashboard.md) · [docs/specs/features/app-search.md](docs/specs/features/app-search.md) |
| **Foundation AC** | [docs/specs/features/teams-foundation.md](docs/specs/features/teams-foundation.md) — **Read-path integration** (`sharing` descriptor on read models; dashboard + search still incomplete vs library) |
| **ADR** | [ADR-0009](docs/decisions/0009-computed-fields-belong-in-api-read-models.md) (computed fields in API) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) |
| **Web intent** | none this layer |
| **Contract** | regenerate `docs/reference/openapi.json` |

**Concern:** Backend only — put computed `sharing` on dashboard + search (same shape as `ListAssets`).

**Do not:** web UI (#59), activity (#73).

#### Implementation

- [ ] Read AC in `dashboard.md` + `app-search.md` + teams-foundation read-path section before coding
- [ ] `GetDashboard` attaches `sharing` to fleet/queue representations that surface assets
- [ ] `SearchAssets` reverses intentional omission of `sharing` on hits
- [ ] Zod / OpenAPI schemas updated for dashboard + search `sharing`
- [ ] OpenAPI regenerated and committed
- [ ] Use-case tests: owned vs shared-with-me vs personal
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` green
- [ ] PR opened (stack bottom, base `main`) with `Closes #74` and Spec links above
- [ ] PR merged

#### Spec / docs updates (same PR)

- [ ] Check off AC in `dashboard.md` that this PR implements (only tested ones)
- [ ] Check off AC in `app-search.md` that this PR implements (only tested ones)
- [ ] Check off teams-foundation read-path AC only if this PR completes remaining descriptor gaps for dashboard/search
- [ ] No web `FEATURES.md` badge work (that's A2)

---

### A2 — `feat/59-sharing-badges` · Closes #59 · base = A1

| | |
| --- | --- |
| **Issue** | [#59](https://github.com/snaveevans/pineapple/issues/59) |
| **Primary specs** | [docs/specs/features/teams-foundation.md](docs/specs/features/teams-foundation.md) (read-path / member visibility UX) |
| **Surface specs** | [docs/specs/features/asset-library.md](docs/specs/features/asset-library.md) · [docs/specs/features/dashboard.md](docs/specs/features/dashboard.md) · [docs/specs/features/app-search.md](docs/specs/features/app-search.md) |
| **Web intent** | [docs/web/FEATURES.md](docs/web/FEATURES.md) — library, home/dashboard, search entries |
| **ADR** | [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) |
| **Depends on** | A1 API descriptors for dashboard + search; library already has `sharing` from #58 |

**Concern:** Web badges only.

**Do not:** backend changes beyond what A1 already provides.

#### Implementation

- [ ] Read teams-foundation + surface specs + `FEATURES.md` before coding
- [ ] Asset library cards: “shared with team” / “shared by {owner}” (API already has `sharing`)
- [ ] Dashboard queue rows consume A1 `sharing` descriptor
- [ ] Search results consume A1 `sharing` descriptor
- [ ] UI tests for badge copy and states
- [ ] `docs/web/FEATURES.md` updated for list badges
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` green
- [ ] PR opened (stacked on A1) with `Closes #59` and Spec links above
- [ ] PR merged (after A1)

#### Spec / docs updates (same PR)

- [ ] Check off UI-facing AC this PR implements in the surface specs (if present)
- [ ] `FEATURES.md` reflects badge behavior on library / dashboard / search

---

## Stack B — Shared activity (parallel with A)

### B1 — `feat/73-shared-activity` · Closes #73

| | |
| --- | --- |
| **Issue** | [#73](https://github.com/snaveevans/pineapple/issues/73) |
| **Primary spec** | [docs/specs/features/activity-history.md](docs/specs/features/activity-history.md) — shared-asset access, actor attribution, filters, pagination |
| **Foundation AC** | [docs/specs/features/teams-foundation.md](docs/specs/features/teams-foundation.md) — **Member access** unchecked rows: activity follows the asset |
| **ADR** | [ADR-0010](docs/decisions/0010-smart-events-for-durable-consumers.md) (actor display name on durable events) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) |
| **Web intent** | [docs/web/FEATURES.md](docs/web/FEATURES.md) — History / activity |
| **Telemetry** | [docs/specs/cross-cutting/telemetry.md](docs/specs/cross-cutting/telemetry.md) — no actor display name in AE |
| **Contract** | regenerate OpenAPI if activity response shape changes |

**Concern:** Activity feed access + actor attribution (closes last unchecked teams-foundation AC).

If event payload + migration + query + UI exceeds ~800 lines or ~40 files, **split** before opening (same specs apply to every sub-slice):

| Split | Slice | Spec focus |
| ----- | ----- | ---------- |
| B1a | Event payload + projection migration + write path | activity-history + ADR-0010 |
| B1b | List query + filters + API | activity-history access/filters AC |
| B1c | Web attribution | activity-history UI + FEATURES.md |

Prefer one PR if it stays tight.

#### Backend

- [ ] Read `activity-history.md` + teams-foundation activity AC + ADR-0010 before coding
- [ ] `ListActivity` / activity repo: visible = own activity **OR** activity on assets **currently** shared with caller's team
- [ ] Evaluate against **current** sharing (unshared asset entries drop out next request)
- [ ] Shared asset shows **full** history, including entries predating the share
- [ ] Actor on read model: stable id + display name snapshot (never email/auth ids)
- [ ] Smart events (ADR-0010): producers supply actor display name; History projection stores snapshot
- [ ] Migration if activity entries need actor display name column/payload
- [ ] `availableFilters` computed over accessible set (owned + currently shared)
- [ ] Telemetry handlers stay thin — **do not** write actor display name to Analytics Engine
- [ ] OpenAPI regenerated if activity contract changes
- [ ] Tests: access, filters, actor attribution, unshare drops access, telemetry PII-free

#### Web

- [ ] `AppActivityHistory.tsx` renders shared-asset entries
- [ ] Per-entry actor attribution (“you” vs teammate display name)
- [ ] UI tests for shared entries + attribution
- [ ] `docs/web/FEATURES.md` updated if History behavior changes

#### Spec / PR

- [ ] Check activity-related AC in `teams-foundation.md` this PR lands
- [ ] Check activity-history AC this PR lands (only boxes covered by tests)
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` green
- [ ] PR opened with `Closes #73` (or `Refs #73` on intermediate B1a/B1b slices) and Spec links above
- [ ] PR(s) merged

---

## After Stacks A + B — foundation complete

| Spec | Action |
| ---- | ------ |
| [teams-foundation.md](docs/specs/features/teams-foundation.md) | All AC checked → status `active` |
| [SPECS.md](docs/specs/SPECS.md) | Row status → `active` |
| [activity-history.md](docs/specs/features/activity-history.md) / [dashboard.md](docs/specs/features/dashboard.md) / [app-search.md](docs/specs/features/app-search.md) / [asset-library.md](docs/specs/features/asset-library.md) | Align status/AC with code if still stale |
| [#53](https://github.com/snaveevans/pineapple/issues/53) | Close if read specs fully describe team-shared assets |

- [ ] Stack A1, A2, and B1 (or B1a–c) are on `main`
- [ ] Remaining teams-foundation AC boxes checked if behavior is tested on `main`
- [ ] `teams-foundation.md` status → `active`
- [ ] `SPECS.md` row for teams-foundation reflects `active`
- [ ] Epic #62 foundation checklist rows updated (③ activity, ④ descriptor, ⑤ web badges)
- [ ] Optional: close #53 if read specs still say “own assets only” — land any missing wording from the read-surface pass

---

## Stack C — Invite teammate (#60)

**Spec-first.** Do not fold team rename/remove/leave into this stack (#61).

### C1 — `docs/60-invite-teammate-spec` · Refs #60

| | |
| --- | --- |
| **Issue** | [#60](https://github.com/snaveevans/pineapple/issues/60) |
| **Spec to author** | [docs/specs/features/invite-teammate.md](docs/specs/features/invite-teammate.md) _(does not exist yet — create here)_ |
| **Skill** | `.agents/skills/spec-author/SKILL.md` |
| **Depends on / references** | [teams-foundation.md](docs/specs/features/teams-foundation.md) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) · [ADR-0012](docs/decisions/0012-transactional-email-via-cloudflare-email-sending.md) · cross-cutting auth/permissions/validation/telemetry |
| **Related open decision** | [#55](https://github.com/snaveevans/pineapple/issues/55) → [notifications.md](docs/specs/features/notifications.md) — note as flag; do not invent multi-recipient reminders |
| **Index** | [docs/specs/SPECS.md](docs/specs/SPECS.md) |

- [ ] Author `docs/specs/features/invite-teammate.md` (spec-author skill)
- [ ] Cover: invite-by-email, pending/accept/decline, one-team-per-user on accept
- [ ] Cover: token security, rate limits, email via existing sending port
- [ ] Note #55 (reminder recipients) as open product flag — do **not** invent multi-recipient reminders unless decided
- [ ] Index in `docs/specs/SPECS.md`
- [ ] PR opened with `Refs #60` and link to the new spec path
- [ ] Spec PR merged / approved as implementable (`status: review`)

### C2+ — Implementation layers · final layer Closes #60

**Implement against:** [docs/specs/features/invite-teammate.md](docs/specs/features/invite-teammate.md) (from C1) only.  
**Web intent:** update [docs/web/FEATURES.md](docs/web/FEATURES.md) in C5.

Adjust after C1 review if needed. Suggested vertical slices:

#### C2 — Domain + storage

- [ ] Read invite-teammate AC for domain/persistence before coding
- [ ] Invitation aggregate / domain model
- [ ] Tables + migrations
- [ ] Domain tests
- [ ] Stacked PR (`Refs #60` unless this alone finishes the issue)

#### C3 — API

- [ ] Read invite-teammate API/AC section before coding
- [ ] Create / list / accept / decline endpoints
- [ ] Auth, validation, conflict rules (at-most-one-team on accept)
- [ ] OpenAPI regenerated
- [ ] Use-case + schema tests
- [ ] Check off API AC this layer lands in invite-teammate.md
- [ ] Stacked PR (`Refs #60`)

#### C4 — Email path

- [ ] Read invite-teammate email/rate-limit AC + ADR-0012 before coding
- [ ] Invite email send via existing email port
- [ ] Rate limits / failure behavior per spec
- [ ] Tests
- [ ] Check off email AC this layer lands
- [ ] Stacked PR (`Refs #60`)

#### C5 — Web

- [ ] Read invite-teammate UI stories/AC + FEATURES.md before coding
- [ ] Invite UI on team page
- [ ] Accept (and decline if in-app) flow
- [ ] `docs/web/FEATURES.md` updated
- [ ] UI tests
- [ ] Check off remaining invite-teammate AC; status → `active` when all done
- [ ] Final PR with `Closes #60`
- [ ] Stack C fully merged

---

## Stack D — Team management (#61)

Depends on multi-member reality from #60.

### D1 — `docs/61-team-management-spec` · Refs #61

| | |
| --- | --- |
| **Issue** | [#61](https://github.com/snaveevans/pineapple/issues/61) |
| **Spec to author** | [docs/specs/features/team-management.md](docs/specs/features/team-management.md) _(does not exist yet — create here)_ |
| **Skill** | `.agents/skills/spec-author/SKILL.md` |
| **Must resolve** | [#56](https://github.com/snaveevans/pineapple/issues/56) — shared-asset lifecycle when owner leaves (decision lives **in this spec**) |
| **Depends on / references** | [invite-teammate.md](docs/specs/features/invite-teammate.md) · [teams-foundation.md](docs/specs/features/teams-foundation.md) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) · [permissions.md](docs/specs/cross-cutting/permissions.md) |
| **Index** | [docs/specs/SPECS.md](docs/specs/SPECS.md) |

- [ ] Author `docs/specs/features/team-management.md`
- [ ] Roles: remove member, leave, transfer ownership, rename, delete team
- [ ] **Resolve #56 in the spec:** leave/remove owner of shared assets → auto-unshare / reassign / block (pick one, document)
- [ ] Index in `docs/specs/SPECS.md`
- [ ] PR opened with `Refs #61` (and note #56 decision) + link to new spec
- [ ] Spec PR merged / approved as implementable (`status: review`)

### D2+ — Implementation layers · final Closes #61 (and #56)

**Implement against:** [docs/specs/features/team-management.md](docs/specs/features/team-management.md) (from D1) only.  
**Web intent:** update [docs/web/FEATURES.md](docs/web/FEATURES.md) in D4.

#### D2 — Membership mutations

- [ ] Read team-management AC for leave/remove + #56 lifecycle before coding
- [ ] Remove member / leave team per D1 rules
- [ ] Shared-asset lifecycle on leave/remove per #56 decision in the spec
- [ ] Tests + OpenAPI if needed
- [ ] Check off AC this layer lands
- [ ] Stacked PR (`Refs #61`)

#### D3 — Ownership transfer / rename / delete

- [ ] Read team-management AC for transfer/rename/delete before coding
- [ ] Transfer ownership, rename, delete team per D1
- [ ] Tests + OpenAPI
- [ ] Check off AC this layer lands
- [ ] Stacked PR (`Refs #61`)

#### D4 — Web admin UI

- [ ] Read team-management UI AC + FEATURES.md before coding
- [ ] Team management UI
- [ ] `docs/web/FEATURES.md` updated
- [ ] UI tests
- [ ] Check off remaining team-management AC; status → `active` when all done
- [ ] Final PR with `Closes #61` (and `Closes #56` if decision fully implemented)
- [ ] Stack D fully merged

---

## Decision follow-ups (tracked, not foundation blockers)

### #55 — Reminder recipient for team-shared assets

| | |
| --- | --- |
| **Issue** | [#55](https://github.com/snaveevans/pineapple/issues/55) |
| **Spec to update** | [docs/specs/features/notifications.md](docs/specs/features/notifications.md) |
| **Context** | Deferred flag in [teams-foundation.md](docs/specs/features/teams-foundation.md); owner-only today |
| **Related** | invite-teammate (#60) makes multi-member real |

Decide before multi-member reminders matter in production.

- [ ] Decision recorded (owner only / all members / designated contact)
- [ ] `notifications.md` (and related) updated if behavior changes
- [ ] Implementation issue filed or work sliced if not owner-only
- [ ] Issue #55 closed when decided (and implemented if decision requires code)

### #56 — Shared-asset lifecycle when owner leaves

| | |
| --- | --- |
| **Issue** | [#56](https://github.com/snaveevans/pineapple/issues/56) |
| **Spec that owns the decision** | [docs/specs/features/team-management.md](docs/specs/features/team-management.md) (D1) |
| **Implementation** | Stack D2+ against that AC |

- [ ] Decision recorded in team-management spec
- [ ] Implemented with membership leave/remove
- [ ] #56 closed

### #52 — 404-masking (out of plan, related)

| | |
| --- | --- |
| **Issue** | [#52](https://github.com/snaveevans/pineapple/issues/52) |
| **Spec** | [docs/specs/cross-cutting/permissions.md](docs/specs/cross-cutting/permissions.md) |

- [ ] _(optional later)_ Standardize wrong-owner access on 404 — **not part of this plan**

---

## Execution order (day-to-day)

- [ ] 1. Confirm `gh stack` works on this repo
- [ ] 2. From clean `main`: **Stack A** (`gs init feat/74-…` → A1 → `gs add feat/59-…` → A2 → `gs push && gs submit`) — specs: dashboard, app-search, teams-foundation, then FEATURES.md
- [ ] 3. From clean `main` (second worktree OK): **Stack B** (`gs init feat/73-…`) — specs: activity-history, teams-foundation, ADR-0010
- [ ] 4. Land A then B (or reverse); keep each layer reviewable and CI-green
- [ ] 5. Foundation complete checklist (teams-foundation → `active`)
- [ ] 6. **Stack C** — author invite-teammate.md, then implement against it
- [ ] 7. **Stack D** — author team-management.md (incl. #56), then implement against it
- [ ] 8. Epic #62 foundation + invite + management checkboxes closed

---

## Definition of done (this plan)

- [ ] Stacks A+B merged → [teams-foundation.md](docs/specs/features/teams-foundation.md) fully implemented and `active`
- [ ] Stack C merged → [invite-teammate.md](docs/specs/features/invite-teammate.md) implemented and `active`
- [ ] Stack D merged → [team-management.md](docs/specs/features/team-management.md) implemented and `active`; #56 decided and coded
- [ ] Epic #62 foundation + invite + management checkboxes closed
- [ ] #55 still a deliberate notifications follow-up unless decided earlier

---

## Risks / watch-outs

| Risk | Mitigation |
| ---- | ---------- |
| `gh stack` preview not enabled | Fall back to manual base-branch PRs (`base: feat/74-…`) with same layering |
| #73 event/migration size | Pre-split B1a/B1b/B1c if mid-implementation exceeds budget; same specs on each slice |
| Spec vs code AC drift | Only check boxes this PR tests; open the Task → spec map paths first |
| Invite without #55 | Keep owner-only reminders until decision; document in invite-teammate.md |

---

## First action

1. Verify `gh stack` on this repo  
2. Open **A1 specs**: [dashboard.md](docs/specs/features/dashboard.md), [app-search.md](docs/specs/features/app-search.md), [teams-foundation.md](docs/specs/features/teams-foundation.md)  
3. Implement **Stack A Layer 1 (#74)** from `main`  
4. Check off boxes in this file as each item lands  

When a PR merges a feature slice, also run `docs/specs/prompts/pr-sync.md` against the diff if behavior changed.
