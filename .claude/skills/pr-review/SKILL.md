---
name: pr-review
description: Review a pull request or the current branch diff for bugs, CLAUDE.md adherence, and architectural fit. Fans out parallel reviewers, scores each finding for confidence, and reports only what survives. Use when asked to review a PR, review a branch before opening one, or check a change before merge.
---

# PR review

Adapted from Anthropic's `code-review` plugin (`anthropics/claude-plugins-official`).
Three changes from upstream: it reviews a **branch diff** as well as a PR, it **never
posts to GitHub** unless the invoking request explicitly asks, and its false-positive
rules are tuned to what this repo's CI already enforces.

## Pick the target

- A PR number or URL in the request → review that PR (`gh pr diff`, `gh pr view`).
- Otherwise → review the current branch against `main` (`git diff main...HEAD`).

State which one you picked in a single line before starting.

## 1. Eligibility (PR targets only)

Check whether the PR is closed, a draft, automated, trivially safe, or already carries
a review from you. If any of those hold, stop and say why. Skip this step for a branch
diff — an unopened branch is always eligible.

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
- **75** — Highly confident. Double-checked, very likely hit in practice, and the PR's
  approach is insufficient. Or it is named directly in the relevant `CLAUDE.md`.
- **100** — Certain. Confirmed, frequent in practice, evidence directly supports it.

For anything flagged on `CLAUDE.md` grounds, the scorer must confirm `CLAUDE.md`
actually says that. **Drop everything under 80.** If nothing survives, say so — a quiet
review is a valid result, not a failure.

## 5. Report

Report in-session by default. If the `ReportFindings` tool is available, use it, ranked
most-severe first, and do not also print the findings as prose. Otherwise print them:
each with file and line, why it matters, and a fix direction — not a patch.

**Do not comment on GitHub unless the request that invoked this skill explicitly asked
you to.** Posting is public and outward-facing. When it is asked for, confirm the text
first, keep it brief, skip emojis, and cite code with full-SHA permalinks
(`https://github.com/snaveevans/pineapple/blob/<full-sha>/path#L4-L7`) — a `git rev-parse`
subshell will not render in Markdown.

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
