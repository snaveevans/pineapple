---
name: pr-review
description: Review a pull request or the current branch diff for bugs, CLAUDE.md adherence, and architectural fit. Fans out parallel reviewers, scores each finding for confidence, reports only what survives, and posts an approved / changes-requested verdict comment on PR targets. Use when asked to review a PR, review a branch before opening one, or check a change before merge.
---

# PR review

Adapted from Anthropic's `code-review` plugin (`anthropics/claude-plugins-official`).
Three changes from upstream: it reviews a **branch diff** as well as a PR, it **posts a
verdict comment** on PR targets (approved / changes requested), and its false-positive
rules are tuned to what this repo's CI already enforces.

## Identify, don't fix

This skill finds problems — code quality, bugs, architectural fit. It does not solve
them. Do not edit files, write patches, suggest diffs, or describe how to fix a finding,
even when the fix is obvious and even when asked to be helpful. State what is wrong and
why it matters; where to go from there is the author's call.

A finding is complete when a reader knows the defect and its consequence. Resist the
pull to add "…, so extract it into a helper" — that sentence is out of scope, and it
biases the author toward your solution before they have judged the problem. If a fix is
genuinely wanted, that is a separate request on a separate turn.

## Pick the target

- A PR number or URL in the request → read that PR's diff and metadata using
  whatever GitHub access this environment provides: the `gh` CLI (`gh pr diff`,
  `gh pr view`), the GitHub MCP tools (e.g. a `pull_request_read` tool), or the
  API. Do not assume `gh` exists — a cloud-agent session typically has GitHub MCP
  tools instead. If none is available, fall back to the branch diff and say so.
- Otherwise → review the current branch against `main` (`git diff main...HEAD`).

State which target you picked, and which access path, in a single line before
starting.

## 1. Eligibility (PR targets only)

Check whether the PR is closed, a draft, automated, or trivially safe. If any of those
hold, stop and say why — and do not post. Skip this step for a branch diff — an unopened
branch is always eligible.

A verdict comment already on the PR from a previous run is **not** a stop condition,
whatever SHA it names. Eligibility governs whether the review _runs_; whether it _posts_
is step 7's call. Someone re-running the skill on unchanged commits — with "don't post",
or after these review criteria changed — still wants the findings.

## 2. Check for prior review (PR targets only)

List the PR's comments and find the **most recent** one carrying the
`<!-- pineapple-pr-review -->` marker. Don't assume there's only one — without an edit
path (step 7), earlier rounds leave a trail, and only the latest describes current state.
Keep whatever this search finds (comment id, SHA it named) — step 7 needs it too, don't
re-search.

- **No marker comment** → first review of this PR. Continue to step 3 for a full review
  against `main`.
- **Marker comment found, naming SHA `S`** → diff `S..HEAD` (the commits since that
  verdict, not the whole PR against `main`).
  - Diff is empty, or touches only `pnpm-lock.yaml` or the generated
    `docs/reference/openapi.json` / `apps/web/src/api/schema.ts` → nothing reviewable
    changed. Skip straight to step 6: say so in-session, post nothing, stop. Do not
    gather context or launch reviewers for a no-op push.
  - Diff has other content → continue to step 3 for an **incremental review**: scoped to
    `S..HEAD`, and carry forward any unresolved finding from the prior verdict so it
    doesn't silently drop just because this round's diff didn't touch that line again.

Skip this step for a branch diff — there's no prior comment to find — and go straight to
step 3 for a full review.

## 3. Gather context

Collect the paths (not the contents) of the root `CLAUDE.md` and any `CLAUDE.md` in
directories the change touches. Summarize the change in a few lines: what it does and
which layers it crosses. On an incremental review, summarize only `S..HEAD`.

## 4. Review the change

Before picking a mode, check whether this is a **dependency-bump PR**: author is
`dependabot[bot]` (the `dependencies` label corroborates but the author is what
matters) and the diff touches only manifest/lockfile files — `package.json`,
`pnpm-lock.yaml`, or a workspace package's `package.json` under `apps/*` / `packages/*`.
If so, skip straight to **Dependency-bump review** below, whether this is the PR's first
review or a later one — a version bump doesn't earn five parallel agents just because
nobody has looked at this PR yet.

**First review (no prior verdict, not a dependency bump)** — fan out these five in
parallel. Each returns a list of issues, and for each issue the reason it was flagged.

1. **Conventions** — audit against `CLAUDE.md` and the repo-specific targets below.
   `CLAUDE.md` is guidance for writing code, so not every line applies to review.
2. **Bugs** — read only the diff and scan for real defects. Favor large problems over
   nitpicks. Do not go hunting for extra context.
3. **History** — read `git blame` and history of the modified code; judge the change
   against why the code got that way.
4. **Prior review** — read earlier PRs touching these files and check whether comments
   there apply again.
5. **Comments and docs** — check the change against guidance in nearby code comments,
   the relevant spec in `docs/specs/features/`, and any ADR it depends on.

**Incremental review (prior verdict exists, not a dependency bump)** — do not repeat the
fan-out. Run a single pass over the `S..HEAD` diff, checking it against the same five
angles above. The range is small and the rest of the PR already has a verdict; five
parallel agents re-reading the whole diff for a one-file fixup is cost with no matching
benefit.

**Dependency-bump review** — one pass, no fan-out, and none of the five angles above:
they're conventions/architecture checks and a version bump has neither. Instead:

1. Confirm the diff is actually confined to manifest/lockfile files. If dependabot's diff
   touches anything else — a config file, a source file, a workaround for the new version
   — that's no longer a mechanical bump. Fall through to the first-review or incremental
   mode above for the whole PR; something touched by hand needs the real rubric.
2. If it's confined as expected, there is nothing here for a diff review to add: `ci.yml`
   (lint/type-check/test) and, since `pnpm-lock.yaml` sits in `mutation.yml`'s scope
   regex, the full mutation suite already run against the bumped dependency. Note the
   version jump (patch/minor/major) in-session for visibility, and approve — a major-
   version bump is a judgment call for whoever merges it, not a diff-review finding.

## 5. Score every finding

For each issue, independently score confidence 0-100. Give the scorer this rubric
verbatim:

- **0** — Not confident. False positive under light scrutiny, or pre-existing.
- **25** — Somewhat confident. Might be real; could not verify. Stylistic issues the
  relevant `CLAUDE.md` does not explicitly call out land here.
- **50** — Moderately confident. Verified real, but a nitpick or rare in practice.
- **80** — Highly confident. Double-checked, very likely hit in practice, and the PR's
  approach is insufficient. Or it is named directly in the relevant `CLAUDE.md`.
- **100** — Certain. Confirmed, frequent in practice, evidence directly supports it.

For anything flagged on `CLAUDE.md` grounds, the scorer must confirm `CLAUDE.md`
actually says that. **Drop everything under 80.** If nothing survives, say so — a quiet
review is a valid result, not a failure.

## 6. Report in-session

If the `ReportFindings` tool is available, use it, ranked most-severe first, and do not
also print the findings as prose. Otherwise print them: each with file and line, the
defect, and why it matters. No fix, no patch.

## 7. Post the verdict (PR targets only)

The verdict follows mechanically from step 5 — there is no separate judgment call:

- **Changes requested** — one or more findings scored 80+ (including any carried forward
  from the prior verdict on an incremental review, still unresolved).
- **Approved** — nothing survived scoring.

Post it as a **plain PR comment**, not a formal GitHub review. A formal
`REQUEST_CHANGES` blocks merge until a human dismisses it, and GitHub rejects an
approval from the PR's own author — so on a self-authored PR the formal path fails
silently while a comment always lands.

Skip posting when: the target is a branch diff (nothing to post to), the request that
invoked this skill asked you not to post, step 1 stopped the review, or step 2 already
found the current head SHA has a published verdict and nothing reviewable changed since.

### Comment format

Lead with the verdict, keep it short, skip emojis. Cite code with full-SHA permalinks
(`https://github.com/snaveevans/pineapple/blob/<full-sha>/path#L4-L7`) — resolve the SHA
to a literal value first, since a `git rev-parse` subshell will not render in Markdown.

```markdown
<!-- pineapple-pr-review -->

## Code review: changes requested

Reviewed `<full head SHA>` against `main`.

1. **`apps/api/src/application/Foo.ts:42`** — what is wrong, and the consequence it
   carries. Stop there; no suggested fix.
2. ...

<sub>Covered: bugs, CLAUDE.md adherence, architectural fit. Not covered: lint, type-check,
and tests (CI enforces those), test coverage, and general security posture.</sub>

On a dependency-bump review, say so instead of claiming the full scope: `<sub>Dependency
bump — confirmed the diff is confined to manifest/lockfile files; CI (lint, type-check,
test, mutation) covers the rest.</sub>`

---

_Generated by [Claude Code](https://claude.ai/code)_
```

On approval, use `## Code review: approved`, drop the findings list, and say in one line
what you looked at and found clean.

Three things that comment must carry, every time:

- **The head SHA it reviewed.** A verdict outlives the commits it judged; naming the SHA
  makes a stale "approved" visibly stale instead of quietly wrong.
- **The `<!-- pineapple-pr-review -->` marker.** It is how the next run finds prior verdicts.
- **The scope caveat.** "Approved" must not read as broader assurance than a diff review.

### Edit by ID — never blind-edit

Use the comment id found in step 2. When the environment can edit a comment by its ID,
edit that comment in place:
`PATCH /repos/snaveevans/pineapple/issues/comments/{id}`, `gh api --method PATCH` against
the same endpoint, or a GitHub MCP comment-update tool. One live verdict beats a thread of
contradicting ones.

**Do not use `gh pr comment --edit-last`.** It targets the authoring account's most recent
comment on the PR, marker or no marker. Agent comments and this repo's PRs go out under
the same account, so a maintainer reply posted after the verdict would be silently
overwritten with no record it existed — and on a PR where that account has never
commented it errors rather than falling through to posting.

### When there is no edit path

Cloud-agent sessions — the ones this skill was vendored for (#113) — typically have no
`gh`, no direct API access, and a GitHub MCP server that creates comments but cannot
update them. Check before assuming an edit path exists. Where none does:

- Post a new comment **only when the verdict or its findings differ** from the latest
  marker comment. An unchanged verdict adds nothing; post nothing and say so in-session.
- Open it with `Supersedes the verdict on <old head SHA>.` and link that comment.
- Accept one verdict per round of substantive change. That is the cost of no edit path,
  and it is why the SHA line is mandatory and why this section reads the _most recent_
  marker comment rather than assuming a unique one.

Report in-session what you posted and where — including when you deliberately posted
nothing.

## What CI already covers — do not flag

`ci.yml` runs `pnpm lint`, `pnpm type-check`, and `pnpm -r test`, so these turn the PR
red on their own. Flagging them is noise:

- Layer-boundary import violations (`eslint-plugin-boundaries`)
- Floating promises, `process.env`, and Node built-ins under `apps/api/src/**`
- Type errors, formatting, import mistakes
- A stale `docs/reference/openapi.json`

Also skip: pre-existing issues, pedantic nitpicks a senior engineer would not raise,
missing test coverage or general security posture unless `CLAUDE.md` requires it,
findings on lines the change did not touch, intentional behavior changes that are part
of the point, and anything explicitly silenced with a lint-ignore.

## Repo-specific review targets

These are the judgment calls lint **cannot** make. This is where the review earns its
keep — in each case both files can be individually clean.

- **Computed fields (ADR-0009)** — derived values (status labels like `overdue`/`soon`/
  `ok`, per-bucket counts, available filter categories) belong in the application layer
  and ship inside read-model responses. Flag a client recomputing business logic from
  raw data. UI-only state — selected filter, hover — correctly stays client-side.
- **Smart Events (ADR-0010)** — events consumed by durable handlers must carry the state
  and producer-owned conclusions those consumers need. Flag a consumer that re-reads the
  source aggregate or re-derives a conclusion. Flag presentation copy on an event.
  Cross-aggregate fields belong to the application layer, never assembled by an aggregate.
  **Highest priority: a telemetry handler writing PII-bearing fields to Analytics
  Engine.** Telemetry handlers stay thin selective readers.
- **Error contract (ADR-0004)** — use cases return `Result<T, DomainError>`; handlers
  throw; `app.onError` maps to status. Flag a use case that throws, or a handler that
  hand-rolls a status code instead of an existing `DomainError` subclass.
- **Branded types (ADR-0002)** — `UserId`, `AssetId`, `Email` constructed via `.from()`
  or `.generate()`. Flag raw strings crossing into domain types.
- **Composition root** — route _specs_ live in `api/`, handlers that instantiate
  repositories live in `worker.ts`. Lint catches the bad import; you catch a spec that
  has drifted from the handler it describes.
- **`exactOptionalPropertyTypes`** — absent is not `undefined`. Check casts at the Zod
  boundary are deliberate rather than a `as any` escape.
- **Scope discipline** — a branch delivers one concern. ~40 files or ~800 net lines is a
  signal to split. Flag a diff that has quietly absorbed an unrelated refactor, rename,
  or infra change.
- **Docs sync** — a merged feature slice should tick its spec checkbox and update
  `docs/specs/SPECS.md`; an `apps/web` flow change should update `docs/web/FEATURES.md`;
  a contract change should have a spec behind it. Flag field tables in
  `docs/reference/data-model.md` that duplicate what `openapi.json` already specifies.
