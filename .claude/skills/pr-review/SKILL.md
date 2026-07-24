---
name: pr-review
description: Review a pull request or the current branch diff for bugs, CLAUDE.md adherence, and architectural fit. Fans out parallel reviewers, scores each finding for confidence, reports only what survives, and posts an approved / changes-requested verdict comment on PR targets. Use when asked to review a PR, review a branch before opening one, or check a change before merge.
---

# PR review

Adapted from Anthropic's `code-review` plugin (`anthropics/claude-plugins-official`).
Three changes from upstream: it reviews a **branch diff** as well as a PR, it **posts a
verdict comment** on PR targets (approved / changes requested), and its false-positive
rules are tuned to what this repo's CI already enforces.

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

A verdict comment already on the PR from a previous run is **not** a stop condition: it
is the comment step 6 updates. Stop only if that comment names the current head SHA —
the same commits have already been reviewed, so re-posting would say nothing new.

## 2. Gather context

Collect the paths (not the contents) of the root `CLAUDE.md` and any `CLAUDE.md` in
directories the change touches. Summarize the change in a few lines: what it does and
which layers it crosses.

## 3. Fan out reviewers

Launch these in parallel. Each returns a list of issues, and for each issue the reason
it was flagged.

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

## 4. Score every finding

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

## 5. Report in-session

If the `ReportFindings` tool is available, use it, ranked most-severe first, and do not
also print the findings as prose. Otherwise print them: each with file and line, why it
matters, and a fix direction — not a patch.

## 6. Post the verdict (PR targets only)

The verdict follows mechanically from step 4 — there is no separate judgment call:

- **Changes requested** — one or more findings scored 80+.
- **Approved** — nothing survived scoring.

Post it as a **plain PR comment**, not a formal GitHub review. A formal
`REQUEST_CHANGES` blocks merge until a human dismisses it, and GitHub rejects an
approval from the PR's own author — so on a self-authored PR the formal path fails
silently while a comment always lands.

Skip posting when: the target is a branch diff (nothing to post to), the request that
invoked this skill asked you not to post, or step 1 stopped the review.

### Comment format

Lead with the verdict, keep it short, skip emojis. Cite code with full-SHA permalinks
(`https://github.com/snaveevans/pineapple/blob/<full-sha>/path#L4-L7`) — resolve the SHA
to a literal value first, since a `git rev-parse` subshell will not render in Markdown.

```markdown
<!-- pineapple-pr-review -->

## Code review: changes requested

Reviewed `<full head SHA>` against `main`.

1. **`apps/api/src/application/Foo.ts:42`** — what is wrong and why it matters, then the
   fix direction in a clause. No patch.
2. ...

<sub>Covered: bugs, CLAUDE.md adherence, architectural fit. Not covered: lint, type-check,
and tests (CI enforces those), test coverage, and general security posture.</sub>

---

_Generated by [Claude Code](https://claude.ai/code)_
```

On approval, use `## Code review: approved`, drop the findings list, and say in one line
what you looked at and found clean.

Three things that comment must carry, every time:

- **The head SHA it reviewed.** A verdict outlives the commits it judged; naming the SHA
  makes a stale "approved" visibly stale instead of quietly wrong.
- **The `<!-- pineapple-pr-review -->` marker.** It is how the next run finds this comment.
- **The scope caveat.** "Approved" must not read as broader assurance than a diff review.

### Update in place, don't stack

Before posting, list the PR's comments and look for one of yours carrying the marker.
If it exists, **edit it** rather than adding another — `gh pr comment --edit-last`, a
GitHub MCP comment-update tool, or `PATCH /repos/snaveevans/pineapple/issues/comments/{id}`.
A PR should end with exactly one live verdict, not a thread of contradicting ones. If the
environment offers no edit path, post a new comment whose first line notes that it
supersedes the earlier verdict.

Report in-session what you posted and where.

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
