---
name: issue-implement
description: Take a GitHub issue through Pineapple's intent-gated delivery flow to a green PR. Changed behavior requires an accepted Intent Brief and approved architecture/evidence packet before implementation; covered bugs reuse accepted coverage and behavior-preserving work skips ceremony. Never merges.
---

# Issue implement

The orchestrator for the intent-driven flow. Takes a GitHub issue number and
drives it through: classify → intent/ready gate when required → spec → ADR →
implement → verify → PR. Delegates detailed work to the owning skills rather
than bypassing their gates.

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

## Intent readiness — hard gate

Before the existing spec/ADR triage, classify the requested work:

| Work                                                     | Required route                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| New capability or materially changed observable behavior | Create or revise an Intent Brief and obtain approval of intent, architecture, evidence, scope, slices, and non-goals |
| Bug contradicting accepted intent/spec                   | Reuse those artifacts and begin with a failing regression test                                                       |
| Bug exposing a product/spec gap                          | Reopen the intent ready gate before implementation                                                                   |
| Behavior-preserving refactor, docs, or chore             | No new intent/spec; record the exception in PR evidence                                                              |

For new or materially changed behavior, require all of the following before any
implementation:

1. A linked Intent Brief in `docs/intents/features/` with status `accepted`.
2. No unresolved material open question.
3. Approved architecture and any required accepted ADRs.
4. An approved evidence plan mapping every affected `OUT-*`/`INV-*`.
5. A linked feature spec whose affected criteria carry slice and intent tags.

If any item is missing, stop the implementation path. Use the Intent Brief
template, invoke `spec-author` while assembling the packet, present the packet
for one explicit human approval, then record that approval in both artifacts.
Do not treat an issue label, a `review` spec status, or green CI as a substitute.
This is an agent-enforced workflow gate; it adds no CI gate.

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

**Gate:** For behavior changes, the single intent/architecture/evidence ready
approval replaces this routine triage confirmation. For behavior-preserving
work, confirm only when classification is genuinely ambiguous.

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

If a spec was authored or revised, confirm it is at `review` or better and that
its linked intent/ready gate passed before proceeding. A `wip`/`draft` spec is
not implementable — `spec-implement` will reject it.

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
pnpm verify
```

`pnpm verify` is the single command with exact CI parity: lint, type-check,
tests, and staleness checks for `docs/reference/openapi.json`,
`apps/api/worker-configuration.d.ts`, and `apps/web/src/api/schema.ts`. If it
flags a stale generated artifact (the contract or wrangler bindings changed),
regenerate it (`openapi:generate` / `cf-typegen` / `api:types`), commit, and
re-run. Do not open a PR with a known-red branch.

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

How the PR opens depends on the §6 verify path:

- **Validation gate ran and opened the PR** → skip to Report.
- **Validation gate ran and stopped on a hard failure** (rebase conflict needing a
  product choice, red tests, an escalation) → respect that stop; report and wait.
- **Lightweight path (gate not used)** → commit and open a PR via `/pr` or the
  template in `.github/pull_request_template.md` and `CLAUDE.md` (Workflow →
  Opening a PR). Committing and pushing the branch are autonomous.

Required template sections:

- **Summary:** 1-3 bullets on what changed and why
- **Related:** `Closes #N` if this PR fully resolves the issue; `Refs #N` for a
  partial slice
- **Risk / Evidence:** always required — see template
- **Validation gate:** include only when the gate was run; otherwise drop that
  section (per the template)
- **Test plan:** concrete verification steps (not empty checkboxes)
- **Spec / AC:** link to `docs/specs/features/[name].md` and check off the
  criteria this PR implements

End commit messages with the Co-Authored-By trailer.

**Gate:** Commit and push the branch autonomously. Do not **merge** without
explicit user approval.

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
