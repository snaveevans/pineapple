---
name: issue-implement
description: Take a GitHub issue from number to merged PR via the spec-driven flow. Reads the issue, triages whether a spec and/or ADR is needed, authors or revises them, implements the target slice, verifies, and opens a PR. Use when asked to implement an issue, work an issue, or take an issue to completion.
---

# Issue implement

The orchestrator for the spec-driven flow. Takes a GitHub issue number and drives
it through: triage → spec → ADR → branch → implement → verify → PR. Delegates to
`spec-author`, `adr-author`, and `spec-implement` rather than duplicating them.

## What this skill is not

This skill does not replace `spec-author`, `adr-author`, or `spec-implement`. It
orchestrates them — deciding _which_ to invoke, in what order, and with what
inputs. Each of those skills owns its own workflow and quality checks; this one
owns the sequencing and the gates between phases.

## 0. Read the issue

The issue number comes from the command's `$ARGUMENTS`. If no number was given,
ask the user.

Fetch the issue. Use `gh` if available, otherwise the GitHub MCP tools, otherwise
the API. Do not assume `gh` exists — a cloud-agent session typically has MCP tools
instead.

```!
gh issue view "$ARGUMENTS" --json number,title,body,labels,assignees,milestone 2>/dev/null
```

Capture:

- **Title and body** — the work to do
- **Labels** — may indicate type (`bug`, `feature`, `refactor`, etc.)
- **Linked specs/ADRs** — the body may reference `docs/specs/...` or `docs/decisions/...`
- **Linked issues/PRs** — may indicate dependencies or related work

Summarize the issue in 2-3 lines and state the issue number. Confirm you have the
right issue before proceeding.

## 1. Triage — what kind of work is this?

Classify the issue into exactly one:

| Type      | Spec needed?          | ADR maybe?                  |
| --------- | --------------------- | --------------------------- |
| Feature   | Yes — new or revised  | If a hard-to-reverse choice |
| Bug fix   | If the spec has a gap | Usually no                  |
| Refactor  | No                    | No                          |
| Mechanism | Maybe (infra spec)    | Yes — new pattern/infra     |

Then check the landscape:

```!
echo "── Feature specs ──"
ls docs/specs/features/*.md 2>/dev/null | xargs -I{} basename {}
echo "── ADRs ──"
ls docs/decisions/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null | xargs -I{} basename {}
```

Determine:

- Does a spec already exist for this feature? Search `docs/specs/features/` and
  the index in `docs/specs/SPECS.md`.
- Does an existing ADR already cover the architectural decision? Search
  `docs/decisions/` and the index in `docs/decisions/README.md`.
- Is this a **mechanism** (new queue, table, migration pattern) that should land
  _before_ the feature that uses it? If so, flag the scope split now — mechanism
  first on its own branch, feature second (CLAUDE.md → Scope discipline).

Present your triage in one block:

- Issue type
- Spec status (exists / needs creating / not needed — and why)
- ADR status (needed / not needed — and why)
- Scope split (if any)

**Gate:** Confirm the triage with the user before proceeding.

## 2. Spec phase

Based on the triage:

- **Feature, no spec** → invoke the `spec-author` skill in **Greenfield** mode.
  Work through it to completion — the spec must reach `status: review` before
  implementation can begin.
- **Feature, spec exists but has gaps for this issue** → invoke `spec-author` in
  **Revise** mode to close the gaps.
- **Bug fix, spec gap** → invoke `spec-author` in **Brownfield** or **Revise**
  mode to document the intended behavior, then fix the code.
- **Bug fix, spec covers it** → skip to implementation. The code is just wrong.
- **Refactor / no behavior change** → skip spec. State explicitly why no spec is
  needed so the decision is on the record.

If a spec was authored or revised, confirm it is at `review` or better before
proceeding. A `wip`/`draft` spec is not implementable — `spec-implement` will
reject it.

## 3. ADR phase

Apply the "Is this even an ADR?" test (see the `adr-author` skill):

- Is the decision **hard to reverse**?
- Were there **real alternatives**?
- Would a future reader ask **"why did they do it this way?"**

If yes to any → invoke the `adr-author` skill. Work through it to a `proposed`
or `accepted` ADR.

If no → say so explicitly. Naming an ADR you should _not_ write is a success,
not a failure.

**Scope discipline:** If this issue is a new mechanism (queue, table, migration
pattern) _and_ a feature that uses it, they are **two branches**. Land the
mechanism first with its ADR; build the feature on top in a follow-up. Do not
fold them into one branch. (CLAUDE.md → Scope discipline.)

## 4. Branch

Create a branch following the naming convention in `CLAUDE.md` (Workflow →
Branch naming). The `/start` command encodes the same rules if you prefer to
delegate.

```
{type}/{issue}-{slug}    # with a GitHub issue
{type}/{slug}            # without
```

- **type:** `feat` | `fix` | `docs` | `refactor` | `chore` | `ci` | `test` |
  `perf` | `security`
- **issue:** bare digits (no `#`)
- **slug:** lowercase kebab-case, short

Agent-assigned branches (`claude/*`, `codex/*`, `opencode/*`) are exempt — use
the platform-assigned name.

If the spec has a **Delivery Plan**, identify the target slice:

- Open the spec's Delivery Plan table.
- Choose the next slice (`Sn`) whose tagged criteria are still `[ ]` and whose
  `Depends on` slices are all `[x]`.
- This PR implements exactly that slice's criteria.

Confirm the branch name and target slice with the user, then create the branch
off the latest `main`.

## 5. Implement

Invoke the `spec-implement` skill to implement the target slice. It will:

- Work through `layer-checklist.md` for each layer the slice touches
- Follow the dependency order: domain → application → infrastructure → API →
  `worker.ts` → frontend
- Run `pnpm lint && pnpm type-check` after each layer
- Run `pnpm -r test` after all layers
- Regenerate OpenAPI types if the contract changed

If no spec (bug fix / refactor), follow the `layer-checklist.md` patterns
directly. The `spec-implement` skill's pre-flight will stop you if a spec exists
but isn't ready — respect that stop.

**Scope discipline:** Implement only the target slice's criteria. If the work
wants to grow past the slice, stop and make an explicit decision — either it's
genuinely part of this slice, or it becomes a follow-up branch. Do not silently
absorb scope. (~40 files / ~800 net lines is the signal to split, not a target.)

## 6. Verify → prefer validation gate

**Default:** invoke the `validation-gate` skill. It rebases on `main`, runs a
fresh-context `pr-review`, lint/type-check/tests, docs/spec sync, hybrid **Risk**
score, evidence pack, and opens a PR from `.github/pull_request_template.md`
(including Risk / Evidence / Escalations). Use it whenever the user wants the
fuller handoff — or when you would otherwise open a PR after implementation.

**Lightweight path** (only if the user asked for a bare PR or the change is
trivial docs/chore): run verify yourself, then `/pr`, but still fill **Risk** and
**Evidence** on the template.

```bash
pnpm lint && pnpm type-check && pnpm -r test
```

If the API contract changed:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
pnpm --filter @snaveevans/pineapple-web api:types
```

Then run the full check one final time. Do not open a PR with a known-red branch.

## 7. Spec sync

When not using `validation-gate` (it includes this pass), check off the acceptance
criteria boxes for the implemented slice:

- `- [ ]` → `- [x]` for each criterion tagged with the target slice (`Sn`)
- Check a box only when its behavior is implemented **and covered by a test** —
  not merely written
- Update spec `status`: first slice → `in-progress`; last slice (no `[ ]`
  remain) → `active`

If no spec, skip this step. If the web app changed meaningfully (new screen,
changed flow, added/removed a feature), also update `docs/web/FEATURES.md`.

## 8. PR

If `validation-gate` already opened the PR, skip to Report. Otherwise commit and
open a PR via `/pr` or the template in `.github/pull_request_template.md` and
`CLAUDE.md` (Workflow → Opening a PR):

- **Summary:** 1-3 bullets on what changed and why
- **Related:** `Closes #N` if this PR fully resolves the issue; `Refs #N` for a
  partial slice
- **Risk / Evidence / Validation gate:** required sections — see template
- **Test plan:** concrete verification steps (not empty checkboxes)
- **Spec / AC:** link to `docs/specs/features/[name].md` and check off the
  criteria this PR implements

End commit messages with the Co-Authored-By trailer.

**Gate:** Do not commit or push without explicit user approval. (CLAUDE.md:
"NEVER commit changes unless the user explicitly asks.")

## 9. Report

Close with a summary of what happened:

- Issue number and type
- Spec: created / revised / skipped (and why)
- ADR: authored / skipped (and why)
- Slice implemented
- PR number and link
- Any follow-up issues or deferred work

If anything was left unaddressed, say what and why — an unmentioned gap reads as
an oversight.
