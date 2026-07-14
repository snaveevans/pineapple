# PLAN: Teams remaining slices

> **Audience:** agents and humans implementing the teams epic  
> **Scope:** teams epic only (#62) — not `/verify-email`, #52, API chores #65–70, or #18  
> **Workflow:** one PR per layer, **merged sequentially off `main`** (default). Stacking with `gh stack` is optional — see [Workflow](#workflow).  
> **Last updated:** 2026-07-13 (reconciled after `main` merge of PR #75 / #53)

Check a box **only when that item is done on the branch/PR that lands it** (code + tests + any required OpenAPI/spec AC updates). Do not check from intent alone.

> **Two checkbox systems — know which is authoritative.** The **spec AC checkboxes** (in `docs/specs/**`) are the real, mergeable deliverable: they live on `main`, ride along in each feature PR, and are what CI and reviewers see. **The checkboxes in _this_ file are an informational tracker only** — PLAN.md is not on `main`, so a feature PR branched off `main` cannot carry edits to it. Never block or gate a PR on updating PLAN.md; update the **spec AC boxes** in the PR, and (optionally) tick PLAN.md separately on whatever branch carries it. If the two ever disagree, the spec wins.

**Before implementing any layer:** open the **Spec** path(s) for that layer, implement only the AC tagged with that layer’s **slice id** (`S3` / `S4` / `S5` / etc.), and check those boxes in the same PR.

> **Issue titles vs. slice ids:** GitHub issue titles use ①–④ numbering that does **not** line up with the `S1`…`S5` slice ids — e.g. both #59 and #73 are titled "teams-foundation ③". Trust the **slice ids** in the Delivery Plans, never the ① numbering in issue titles.

---

## Reconciled from `main` (PR #75 — Closes #53)

Landed on `main` after this plan was first written. **Do not redo.**

| Change | Effect on this plan |
| ------ | ------------------- |
| Read specs updated for team-shared assets | [#53](https://github.com/snaveevans/pineapple/issues/53) **closed** — drop “optional close #53” work |
| [teams-foundation.md](docs/specs/features/teams-foundation.md) **Delivery Plan** `S1`…`S5` | Official slice ids; AC tagged per slice. Status: **`in-progress`** (`S1`/`S2` done) |
| [activity-history.md](docs/specs/features/activity-history.md) Delivery Plan | `S1` base (shipped); **`S2` = #73** (shared activity + actor). Status: **`in-progress`** |
| [dashboard.md](docs/specs/features/dashboard.md) Delivery Plan | **`S3` = #74** (`sharing` on dashboard); **`S4` = #59** (web badges). Status: **`in-progress`** |
| [app-search.md](docs/specs/features/app-search.md) Delivery Plan | **`S3` = #74**; **`S4` = #59**. Status: **`in-progress`** |
| [asset-library.md](docs/specs/features/asset-library.md) Delivery Plan | **`S3` = #59** (web badges; API `sharing` already from teams `S2`). Status: **`in-progress`** |
| [SPECS.md](docs/specs/SPECS.md) lifecycle | `review` → **`in-progress`** → `active`; every AC has exactly one slice tag |
| Spec-author / spec-implement skills | Slice tags + Delivery Plan required when authoring/implementing |

### teams-foundation Delivery Plan (source of truth)

| Slice | Scope | Issue | Status |
| ----- | ----- | ----- | ------ |
| `S1` | Team + membership core | #57 | **done on main** |
| `S2` | Asset sharing + access (backend), `sharing` on `GET /api/assets` | #58 | **done on main** |
| `S3` | Shared-asset activity + actor attribution → criteria in activity-history | #73 | **todo** (Stack B) |
| `S4` | `sharing` on dashboard + search read models → dashboard `S3` + app-search `S3` | #74 | **todo** (Stack A1) |
| `S5` | Web sharing badges → asset-library `S3` + dashboard `S4` + app-search `S4` + FEATURES.md | #59 | **todo** (Stack A2) |

---

## Task → spec map (source of truth)

| Layer | Issue | Spec slice(s) | Spec path(s) | Spec status |
| ----- | ----- | ------------- | ------------ | ----------- |
| A1 | [#74](https://github.com/snaveevans/pineapple/issues/74) | teams-foundation **`S4`**; dashboard **`S3`**; app-search **`S3`** | [dashboard.md](docs/specs/features/dashboard.md), [app-search.md](docs/specs/features/app-search.md), [teams-foundation.md](docs/specs/features/teams-foundation.md) | in-progress |
| A2 | [#59](https://github.com/snaveevans/pineapple/issues/59) | teams-foundation **`S5`**; asset-library **`S3`**; dashboard **`S4`**; app-search **`S4`** | same + [asset-library.md](docs/specs/features/asset-library.md) + [FEATURES.md](docs/web/FEATURES.md) | in-progress |
| B1 | [#73](https://github.com/snaveevans/pineapple/issues/73) | teams-foundation **`S3`**; activity-history **`S2`** | [activity-history.md](docs/specs/features/activity-history.md), [teams-foundation.md](docs/specs/features/teams-foundation.md), [ADR-0010](docs/decisions/0010-smart-events-for-durable-consumers.md) | in-progress |
| C1–C5 | [#60](https://github.com/snaveevans/pineapple/issues/60) | **Author then implement** invite-teammate (own Delivery Plan) | [invite-teammate.md](docs/specs/features/invite-teammate.md) _(create in C1)_ · [teams-foundation.md](docs/specs/features/teams-foundation.md) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) · [ADR-0012](docs/decisions/0012-transactional-email-via-cloudflare-email-sending.md) | not written |
| D1–D4 | [#61](https://github.com/snaveevans/pineapple/issues/61) | **Author then implement** team-management (own Delivery Plan; resolves #56) | [team-management.md](docs/specs/features/team-management.md) _(create in D1)_ | not written |
| Decision | [#55](https://github.com/snaveevans/pineapple/issues/55) | notifications recipient policy | [notifications.md](docs/specs/features/notifications.md) | active |
| Decision | [#56](https://github.com/snaveevans/pineapple/issues/56) | recorded in team-management Delivery Plan / AC | team-management.md (D1) | open |
| Epic | [#62](https://github.com/snaveevans/pineapple/issues/62) | umbrella | teams-foundation + ADR-0015 + [SPECS.md](docs/specs/SPECS.md) | — |
| ~~#53~~ | closed by PR #75 | read-surface spec pass | — | **done** |

**Cross-cutting always in force:**

- [authentication.md](docs/specs/cross-cutting/authentication.md)
- [permissions.md](docs/specs/cross-cutting/permissions.md)
- [validation.md](docs/specs/cross-cutting/validation.md)
- [error-handling.md](docs/specs/cross-cutting/error-handling.md)
- [loading-states.md](docs/specs/cross-cutting/loading-states.md)
- [telemetry.md](docs/specs/cross-cutting/telemetry.md)

**API contract:** `docs/reference/openapi.json` (edit Zod route specs, then regenerate).

**How to find work in a spec:** open Delivery Plan → find slice id → implement every AC tagged `` `Sn` `` for that slice; leave other tags alone.

---

## Reality check

Core product features (dashboard, activity, search, notifications, maintenance, assets, profile) are **already on `main`**. Many older AC boxes remain unchecked pending box reconciliation (noted as Flags in specs) — that is **not** this plan’s scope unless a slice PR owns those boxes.

**Teams epic [#62](https://github.com/snaveevans/pineapple/issues/62)** remaining product track:

| Done | Remaining |
| ---- | --------- |
| #57 / teams `S1` team + membership | **#74** / teams `S4` + dashboard `S3` + search `S3` |
| #58 / teams `S2` asset share + access | **#73** / teams `S3` + activity-history `S2` |
| Create-team + share UI on maintenance | **#59** / teams `S5` + library `S3` + dashboard `S4` + search `S4` |
| #53 read specs reconciled (PR #75) | **#60** invite-teammate |
| `sharing` on `GET /api/assets` | **#61** team-management (+ #56) |
| | **#55** reminder recipient decision |

### Out of scope for this plan

| Item | Related spec (if any) |
| ---- | --------------------- |
| Public `/verify-email` web page | [email-verification.md](docs/specs/features/email-verification.md) |
| #52 404-masking | [permissions.md](docs/specs/cross-cutting/permissions.md) Known Issue |
| API hygiene #65–#70 | (no feature spec) |
| #18 security dashboard | (no feature spec) |
| Parked archive-asset | [archive-asset.md](docs/specs/backlog/archive-asset.md) |
| Reconciling stale `S1` AC boxes on already-shipped features | Flags in activity-history / app-search / etc. |

- [ ] _(do not implement under this plan)_ Public `/verify-email` web page
- [ ] _(do not implement under this plan)_ #52 404-masking
- [ ] _(do not implement under this plan)_ API hygiene #65–#70
- [ ] _(do not implement under this plan)_ #18 security dashboard
- [ ] _(do not implement under this plan)_ Parked archive-asset
- [x] ~~#53 update read specs~~ — **done on main (PR #75)**

---

## Dependency graph

```text
main  (includes #57 S1, #58 S2, PR #75 slice-tagged specs)
 ├─ Stack A (foundation finish — depends on S2)
 │   ├─ A1  #74  teams S4 = dashboard S3 + app-search S3
 │   └─ A2  #59  teams S5 = library S3 + dashboard S4 + app-search S4  (needs A1)
 │
 └─ Stack B (parallel with A — depends on S2 only)
     └─ B1  #73  teams S3 = activity-history S2

main (after A+B) ── Stack C: invite-teammate.md (author → implement)
main (after C) ──── Stack D: team-management.md (author → implement; #56)
                     #55 → notifications.md decision
```

**Why two parallel stacks:** #73 (`S3`) and #74 (`S4`) both depend only on teams `S2` (done). Stack A is the real chain (`S4` → `S5`).

---

## Prerequisites

- [ ] **Sync `main` first:** `git fetch origin && git checkout main && git pull`, and branch every layer off the freshly-fetched `origin/main`. A stale local `main` is missing PR #75's Delivery Plans and slice tags; branching from it silently breaks the "find slice → implement tagged AC" flow.
- [ ] Start each layer from a clean, up-to-date `main`
- [ ] Prefer a **worktree per active layer** if working A and B in parallel
- [ ] _(optional, only if you choose to stack)_ `gh extension install github/gh-stack` + `gh stack alias` (`gs`) — see [Workflow](#workflow)

---

## Workflow

**Default: one PR per layer, merged sequentially off `main`.** This is the recommended path — especially for an agent working unattended, where stacked-branch rebasing is a needless failure mode. The dependency graph is already a clean linear chain. ("Stack A/B/C/D" below names a **logical group of layers**, not a `gh stack` requirement.)

```bash
git checkout main && git pull                 # always branch off fresh origin/main
git checkout -b feat/<issue>-<slug>
# implement → commit (conventional commits + Co-Authored-By) → push → open PR
# wait for CI green → merge → then start the next dependent layer from main
```

A layer that **depends on** another (A2 needs A1; A1 and B1 need only `S2`, already on `main`) starts **after its dependency has merged to `main`** — branch the dependent layer off `main`, not off the open PR.

**Optional: `gh stack`** — only if you are a human keeping several layers in flight at once and want them reviewable in parallel before their base merges. Not required, and not recommended for autonomous agents. If it misbehaves, fall back to the sequential default — never hand-edit PR bases to work around it.

```bash
gs init feat/<issue>-<slug>     # bottom layer, off main
gs add feat/<issue>-<slug>      # next layer, base = previous branch
gs push && gs submit            # push all branches, open PRs with correct bases
```

### Repo conventions (every layer)

- [ ] Branch name: `feat/{issue}-{slug}` (or `docs/{issue}-{slug}` for spec-only)
- [ ] PR body: `Closes #N` only when this PR fully finishes the issue; else `Refs #N`
- [ ] PR **Spec / AC** section lists slice ids (`S4`, dashboard `S3`, …) and paths
- [ ] Check off **only** AC tagged for this slice (and only when tested)
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` before ready
- [ ] OpenAPI regen when contract changes
- [ ] One concern per layer (~40 files / ~800 net lines = split signal)
- [ ] No drive-by refactors, no API hygiene, no archive work

### Per-PR checklist

- [ ] Opened Spec Delivery Plan + all AC with this layer’s slice tag(s)
- [ ] One-sentence scope; stop if a second concern appears
- [ ] Tests for new behavior
- [ ] `pnpm lint && pnpm type-check && pnpm -r test`
- [ ] OpenAPI regen if API changed
- [ ] Spec AC checkboxes for **this slice only**
- [ ] PR: Summary / Related / Test plan / Spec (paths + slice ids)
- [ ] Conventional Commits + Co-Authored-By trailer

---

## Stack A — Read-model badges (teams `S4` → `S5`)

### A1 — `feat/74-sharing-descriptor` · Closes #74 · teams-foundation **`S4`**

| | |
| --- | --- |
| **Issue** | [#74](https://github.com/snaveevans/pineapple/issues/74) |
| **Slice ids** | teams-foundation **`S4`** · dashboard **`S3`** · app-search **`S3`** |
| **Primary specs** | [dashboard.md](docs/specs/features/dashboard.md) · [app-search.md](docs/specs/features/app-search.md) |
| **Foundation** | [teams-foundation.md](docs/specs/features/teams-foundation.md) — Delivery Plan `S4` + AC tagged `S4` |
| **ADR** | [ADR-0009](docs/decisions/0009-computed-fields-belong-in-api-read-models.md) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) |
| **Web** | none this layer |
| **Contract** | regenerate `docs/reference/openapi.json` |

**Concern:** Backend only — computed `sharing` on dashboard + search (same shape as library).

**Do not:** web UI (#59 / `S5`), activity (#73 / `S3`).

#### Implementation

> **Not a pure copy — this changes constructor signatures.** The `sharing` descriptor is computed by the shared `toSharingDescriptor` helper in `apps/api/src/application/usecases/assetSharing.ts`, and `ownerDisplayName` is resolved by batch-loading owners via `UserRepository.findByIds` — see `ListAssets.ts` as the model to copy. **`GetDashboard` and `SearchAssets` do not currently inject `UserRepository`**, so this slice must add that dependency to both use cases, wire it at the composition root (`worker.ts`), and update every existing test that constructs them. Budget for that ripple — it is the bulk of the work, not the descriptor itself.

- [ ] Read all AC tagged dashboard `S3`, app-search `S3`, teams-foundation `S4`
- [ ] Inject `UserRepository` into `GetDashboard` + `SearchAssets`; wire in `worker.ts`; update their existing tests for the new constructor arg
- [ ] `GetDashboard` attaches `sharing` (via `toSharingDescriptor`) where assets surface (fleet/queue)
- [ ] `SearchAssets` adds `sharing` on hits (reverses the intentional omission documented in `SearchAssets.ts`)
- [ ] Reuse `toSharingDescriptor` / `AssetSharingDescriptor` — do not reinvent the shape
- [ ] Zod / OpenAPI schemas updated (dashboard + search responses reference the shared sharing shape)
- [ ] OpenAPI regenerated and committed
- [ ] Use-case tests: owned vs shared-with-me (with `ownerDisplayName`) vs personal
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` green
- [ ] PR opened off `main` with `Closes #74` + slice ids in Spec section
- [ ] PR merged

#### Spec updates (same PR)

- [ ] Check off teams-foundation AC tagged `` `S4` ``
- [ ] Check off dashboard AC tagged `` `S3` ``
- [ ] Check off app-search AC tagged `` `S3` ``
- [ ] Do **not** touch `S1`/`S2` reconciliation Flags unless tests already cover them

---

### A2 — `feat/59-sharing-badges` · Closes #59 · teams-foundation **`S5`** · after A1 merges

| | |
| --- | --- |
| **Issue** | [#59](https://github.com/snaveevans/pineapple/issues/59) |
| **Slice ids** | teams-foundation **`S5`** · asset-library **`S3`** · dashboard **`S4`** · app-search **`S4`** |
| **Primary specs** | [asset-library.md](docs/specs/features/asset-library.md) · [dashboard.md](docs/specs/features/dashboard.md) · [app-search.md](docs/specs/features/app-search.md) |
| **Foundation** | [teams-foundation.md](docs/specs/features/teams-foundation.md) — Delivery Plan `S5` (criteria live in sibling specs) |
| **Web intent** | [docs/web/FEATURES.md](docs/web/FEATURES.md) |
| **Depends on** | A1 (dashboard/search `sharing`); library API already has `sharing` from teams `S2` |

**Concern:** Web badges only.

**Do not:** backend beyond A1.

#### Implementation

- [ ] Read AC tagged library `S3`, dashboard `S4`, app-search `S4`
- [ ] Library cards: “shared with team” / “shared by {owner}”
- [ ] Dashboard queue rows consume A1 `sharing`
- [ ] Search results consume A1 `sharing`
- [ ] UI tests for badge copy/states
- [ ] Behaviorally verify badge copy/states in the running app (preview tooling / `/verify` skill) — not unit tests alone
- [ ] `docs/web/FEATURES.md` updated
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` green
- [ ] PR opened off `main` (after A1 merged) with `Closes #59` + slice ids
- [ ] PR merged (after A1)

#### Spec updates (same PR)

- [ ] Check off asset-library `` `S3` ``, dashboard `` `S4` ``, app-search `` `S4` `` AC this PR lands
- [ ] Note teams-foundation `S5` complete when sibling boxes + FEATURES.md are done (plan Scope cell has no local AC tags)

---

## Stack B — Shared activity (parallel) · teams **`S3`**

### B1 — `feat/73-shared-activity` · Closes #73

| | |
| --- | --- |
| **Issue** | [#73](https://github.com/snaveevans/pineapple/issues/73) |
| **Slice ids** | teams-foundation **`S3`** · activity-history **`S2`** |
| **Primary spec** | [activity-history.md](docs/specs/features/activity-history.md) — Delivery Plan `S2` + all AC tagged `S2` |
| **Foundation** | [teams-foundation.md](docs/specs/features/teams-foundation.md) — AC tagged `S3` (points at activity-history) |
| **ADR** | [ADR-0010](docs/decisions/0010-smart-events-for-durable-consumers.md) · [ADR-0015](docs/decisions/0015-teams-as-opt-in-sharing-scope.md) |
| **Web** | [FEATURES.md](docs/web/FEATURES.md) History |
| **Telemetry** | [telemetry.md](docs/specs/cross-cutting/telemetry.md) — no actor display name in AE |

**Concern:** Activity feed access + actor attribution.

If too large, split (same slice tags; use `Refs #73` until final):

| Split | Slice | Spec focus |
| ----- | ----- | ---------- |
| B1a | Event payload + projection migration + write path | activity-history `S2` + ADR-0010 |
| B1b | List query + filters + API | activity-history `S2` access/filters |
| B1c | Web attribution | activity-history `S2` UI + FEATURES.md |

#### Backend

> **Decide the historical backfill up front.** Activity history is a **durable projection** fed by a queue consumer. Adding actor attribution means *new* events carry the actor display name, but **rows already projected before this slice will not**. The "full history including pre-share" AC forces the question: backfill existing projection rows (migration/replay), or tolerate a null/"Unknown" actor on pre-existing entries? Pick one explicitly and record it in the PR — do not discover it mid-write. If backfill is chosen, it is its own migration step (candidate for split **B1a**).

- [ ] Read every activity-history AC tagged `` `S2` `` + teams-foundation `` `S3` ``
- [ ] **Backfill decision recorded:** replay/migrate historical projection rows for actor attribution, **or** accept null actor on pre-existing entries (with rationale)
- [ ] Feed = own activity **OR** activity on assets **currently** shared with caller’s team
- [ ] Current sharing evaluation; unshare drops entries next request
- [ ] Shared asset shows **full** history (including pre-share)
- [ ] Actor on read model: stable id + display name snapshot (no email)
- [ ] Smart events: actor display name on durable events; projection snapshot
- [ ] Migration if needed for actor display name (and for the backfill, if chosen)
- [ ] `availableFilters` over accessible set
- [ ] Telemetry: no actor display name in AE
- [ ] OpenAPI if response shape changes
- [ ] Tests: access, filters, actor, unshare, PII-free telemetry, **pre-slice historical entries**

#### Web

- [ ] `AppActivityHistory.tsx` shared entries + “you” vs teammate name
- [ ] UI tests
- [ ] Behaviorally verify "you" vs teammate attribution in the running app (preview tooling / `/verify` skill)
- [ ] FEATURES.md if History behavior changes

#### Spec / PR

- [ ] Check off activity-history `` `S2` `` AC this PR lands
- [ ] Check off teams-foundation `` `S3` `` AC
- [ ] `pnpm lint && pnpm type-check && pnpm -r test` green
- [ ] PR with `Closes #73` (or `Refs #73` on intermediate splits)
- [ ] PR(s) merged

---

## After Stacks A + B — foundation complete

| Spec | Action |
| ---- | ------ |
| [teams-foundation.md](docs/specs/features/teams-foundation.md) | `S3`–`S5` all `[x]` → status **`active`** |
| [activity-history.md](docs/specs/features/activity-history.md) | `S2` complete; status may stay `in-progress` until `S1` box reconciliation Flags are cleared (out of plan unless owned) |
| [dashboard.md](docs/specs/features/dashboard.md) / [app-search.md](docs/specs/features/app-search.md) / [asset-library.md](docs/specs/features/asset-library.md) | `S3`/`S4` (as applicable) checked; status → `active` only when **all** boxes including shipped `S1` are reconciled |
| [SPECS.md](docs/specs/SPECS.md) | Update status column when a spec becomes `active` |
| Epic #62 | Mark foundation slices done |

- [ ] A1, A2, B1 on `main`
- [ ] teams-foundation `S3`/`S4`/`S5` AC checked
- [ ] teams-foundation status → `active` (only if **no** remaining `[ ]`)
- [ ] SPECS.md updated
- [ ] Epic #62 foundation rows checked
- [x] #53 closed (PR #75) — no further action

---

## Stack C — Invite teammate (#60)

> **⛔ Decision gate — resolve before starting C/D.** Stacks C and D are **not turn-key tasks**: each begins by *authoring a spec*, and that spec cannot be finished by an agent alone because it encodes two open **product decisions**:
>
> - **#55** — reminder recipient policy for team-shared assets (owner-only vs. all members). Shapes invite/notification behavior.
> - **#56** — shared-asset lifecycle when an owner leaves the team (auto-unshare / reassign / block). Shapes team-management (D).
>
> An agent can *draft* these specs and lay out the options, but a **human must make the #55 and #56 calls** before the specs can reach `status: review` and implementation can begin. Surface both decisions early — do not leave them buried in D1. **Stacks A and B are fully autonomous; C and D are gated on these two calls.**

**Spec-first.** Do not fold team rename/remove/leave (#61).

### C1 — `docs/60-invite-teammate-spec` · Refs #60

| | |
| --- | --- |
| **Issue** | [#60](https://github.com/snaveevans/pineapple/issues/60) |
| **Spec to author** | [docs/specs/features/invite-teammate.md](docs/specs/features/invite-teammate.md) _(create)_ |
| **Skill** | `.agents/skills/spec-author` / `.claude/skills/spec-author` — include **Delivery Plan + slice tags** (post-PR #75 convention) |
| **References** | teams-foundation · ADR-0015 · ADR-0012 · cross-cutting specs |
| **Open decision** | #55 → notifications.md — flag only; no multi-recipient reminders unless decided |
| **Index** | [SPECS.md](docs/specs/SPECS.md) |

- [ ] Author invite-teammate.md with Delivery Plan (`S1`…) and tagged AC
- [ ] Cover invite-by-email, pending/accept/decline, one-team-per-user on accept
- [ ] Cover token security, rate limits, email port
- [ ] Note #55 as flag
- [ ] Index in SPECS.md (`review` until first impl slice)
- [ ] PR `Refs #60` + link to new spec
- [ ] Spec merged / implementable (`status: review`)

### C2+ — Implement against invite-teammate Delivery Plan · final Closes #60

**Spec:** [invite-teammate.md](docs/specs/features/invite-teammate.md) only.  
**Web:** [FEATURES.md](docs/web/FEATURES.md) in final web slice.

Suggested layers (rename to match the Delivery Plan once written):

#### C2 — Domain + storage

- [ ] AC for domain/persistence slice
- [ ] Aggregate + migrations + domain tests
- [ ] Check off that slice’s tags; `Refs #60`

#### C3 — API

- [ ] Create/list/accept/decline + OpenAPI + tests
- [ ] Check off API slice tags; `Refs #60`

#### C4 — Email path

- [ ] Send + rate limits per spec + ADR-0012
- [ ] Check off email slice tags; `Refs #60`

#### C5 — Web

- [ ] Invite UI + accept flow + FEATURES.md + UI tests
- [ ] Remaining AC → status `active`; `Closes #60`
- [ ] Stack C fully merged

---

## Stack D — Team management (#61)

Depends on multi-member from #60.

### D1 — `docs/61-team-management-spec` · Refs #61

| | |
| --- | --- |
| **Issue** | [#61](https://github.com/snaveevans/pineapple/issues/61) |
| **Spec to author** | [docs/specs/features/team-management.md](docs/specs/features/team-management.md) _(create)_ |
| **Skill** | spec-author — Delivery Plan + slice tags |
| **Must resolve** | [#56](https://github.com/snaveevans/pineapple/issues/56) in this spec |
| **References** | invite-teammate · teams-foundation · ADR-0015 · permissions.md |
| **Index** | SPECS.md |

- [ ] Author team-management.md with Delivery Plan + tagged AC
- [ ] Roles: remove, leave, transfer, rename, delete
- [ ] **#56 decision** in-spec (auto-unshare / reassign / block)
- [ ] Index SPECS.md
- [ ] PR `Refs #61` (+ #56 decision note)
- [ ] Spec merged (`status: review`)

### D2+ — Implement against team-management Delivery Plan · final Closes #61 (+ #56)

#### D2 — Membership mutations (+ #56 lifecycle)

- [ ] Leave/remove + shared-asset lifecycle per #56 AC
- [ ] Tests + OpenAPI; check slice tags; `Refs #61`

#### D3 — Transfer / rename / delete

- [ ] Per Delivery Plan; tests; `Refs #61`

#### D4 — Web admin UI

- [ ] UI + FEATURES.md + tests
- [ ] All AC → `active`; `Closes #61` and `Closes #56` if fully done
- [ ] Stack D fully merged

---

## Decision follow-ups

### #55 — Reminder recipient for team-shared assets

| | |
| --- | --- |
| **Issue** | [#55](https://github.com/snaveevans/pineapple/issues/55) |
| **Spec** | [notifications.md](docs/specs/features/notifications.md) |
| **Context** | teams-foundation Flags / owner-only today |

- [ ] Decision recorded
- [ ] notifications.md updated if behavior changes
- [ ] Impl issue or slice if not owner-only
- [ ] #55 closed when decided (+ implemented if needed)

### #56 — Shared-asset lifecycle when owner leaves

| | |
| --- | --- |
| **Issue** | [#56](https://github.com/snaveevans/pineapple/issues/56) |
| **Spec** | team-management.md (D1) |
| **Code** | Stack D2+ |

- [ ] Decision in team-management spec
- [ ] Implemented with leave/remove
- [ ] #56 closed

### #52 — 404-masking (out of plan)

| | |
| --- | --- |
| **Issue** | [#52](https://github.com/snaveevans/pineapple/issues/52) |
| **Spec** | [permissions.md](docs/specs/cross-cutting/permissions.md) |

- [ ] _(optional later)_ not part of this plan

---

## Execution order

- [ ] 1. **Sync `main`** (`git fetch && git checkout main && git pull`) — do not branch off a stale local `main`
- [ ] 2. **Stack A** from `main`: A1 (#74 / `S4`), then A2 (#59 / `S5`) after A1 merges
- [ ] 3. **Stack B** in parallel from `main`: B1 (#73 / `S3` = activity-history `S2`)
- [ ] 4. Land A and B; CI green per layer
- [ ] 5. Foundation complete (teams-foundation `S3`–`S5` done → `active` if no open boxes)
- [ ] 6. **Decision gate:** get human calls on **#55** (reminder recipient) and **#56** (owner-leaves lifecycle) — C and D cannot finish without them
- [ ] 7. **Stack C** invite-teammate (spec → impl)
- [ ] 8. **Stack D** team-management (spec + #56 → impl)
- [ ] 9. Epic #62 foundation + invite + management closed

---

## Definition of done

- [ ] A+B → teams-foundation `S3`–`S5` done; status `active` when fully checked
- [ ] C → invite-teammate implemented and `active`
- [ ] D → team-management implemented and `active`; #56 done
- [ ] Epic #62 foundation + invite + management closed
- [ ] #55 deliberate follow-up unless decided earlier
- [x] #53 read-spec pass done (PR #75)

---

## Risks / watch-outs

| Risk | Mitigation |
| ---- | ---------- |
| Stacking brittleness for agents | **Sequential PRs off `main` are the default;** `gh stack` optional (see [Workflow](#workflow)) |
| Stale local `main` | Always `git fetch && pull` before branching — else missing PR #75 Delivery Plans / slice tags |
| A1 under-scoped as a "copy" | It adds `UserRepository` to `GetDashboard`/`SearchAssets` + worker wiring + test updates (see A1 note) |
| #73 actor backfill | Decide replay-vs-null for pre-slice projection rows up front (see B1 note); candidate split B1a |
| #73 size | Split B1a/b/c; same slice tags |
| Checking wrong AC | Only tags for this slice; ignore `S1` reconciliation Flags |
| PLAN.md vs spec boxes diverge | Spec AC boxes are authoritative (on `main`); PLAN.md is an informational tracker |
| Spec status stuck `in-progress` | Shipped base slices may still have unchecked boxes (Flags) — don’t block foundation on unrelated reconciliation |
| C/D blocked on product calls | Get #55 + #56 decided at the gate before C/D (see Stack C callout) |
| Invite without #55 | Owner-only reminders until decision |

---

## First action

1. **Sync `main`** (`git fetch origin && git checkout main && git pull`)  
2. Open **A1 slice AC**: teams-foundation `S4`, dashboard `S3`, app-search `S3`  
3. Implement **Stack A Layer 1 (#74)** from `main` — mind the `UserRepository` wiring note in A1  
4. Update the **spec AC boxes** as work lands (PLAN.md boxes are an optional tracker; see the checkbox note up top)  

After each feature PR merges: run `docs/specs/prompts/pr-sync.md` if behavior changed.
