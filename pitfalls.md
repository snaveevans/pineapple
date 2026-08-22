# Pitfalls (errors + fixes)

This file is a running log of small-but-annoying issues we've hit, plus the fix that worked.

## 2026-08-21 — zsh expands Markdown backticks in `gh --body` arguments

### Symptom

A GitHub issue comment passed to `gh issue comment --body` in double quotes executed inline
Markdown code spans as shell commands and posted corrupted content.

### Cause

zsh performs command substitution for backticks inside double-quoted shell strings before `gh`
receives the argument.

### Fix

Deleted the malformed comment and reposted the content with a single-quoted `--body` argument.

### How to avoid next time

Use a single-quoted argument or a file-based body whenever a GitHub CLI body includes Markdown
backticks.

## 2026-08-21 — Spec edits need targeted Prettier formatting

### Symptom

`pnpm exec prettier --check` reported formatting issues after editing Markdown specs.

### Cause

The edited Markdown did not match the repository's Prettier wrapping and table formatting.

### Fix

Run `pnpm exec prettier --write` on the changed documentation files, then rerun the targeted
`--check` command and `git diff --check`.

### How to avoid next time

Format changed Markdown specs before final review instead of relying on manual table alignment.

## 2026-08-21 — Vitest `?raw` CSS imports are empty

### Symptom

A web stylesheet regression test imported `auth.css?raw`, but Vitest supplied an
empty string, so the assertion failed without reading the stylesheet.

### Cause

The current Vitest/Vite test configuration does not transform CSS `?raw` imports
into their source text.

### Fix

Read the stylesheet with `readFileSync(new URL("./styles/auth.css", import.meta.url), "utf8")`
from the test instead.

### How to avoid next time

Use a module URL and `node:fs` for source-level CSS assertions unless the test
configuration explicitly enables raw CSS handling.

## 2026-08-21 — lint-staged cannot stash through a symlinked `.claude`

### Symptom

The pre-commit hook failed with `'.claude/commands/pr-respond.md' is beyond a
symbolic link` while committing the move from `.claude` to `.agents`.

### Cause

lint-staged's default backup uses `git stash create`, which cannot process the
old tracked `.claude/...` paths after `.claude` becomes a directory symlink.

### Fix

Committed the move in two phases: first moved and removed the old `.claude` paths,
then added the `.claude -> .agents` symlink in a follow-up commit.

### How to avoid next time

When migrating a tracked directory to a symlink, commit the target-directory move
before adding the symlink so Git can complete the hook's normal stash backup.

## 2026-08-21 — `path` loop variable overwrote zsh `PATH`

### Symptom

A verification loop reported `git: command not found` after its first iteration,
even though Git was available before the loop.

### Cause

In zsh, the special `path` array is tied to the `PATH` environment variable. The
loop assigned file names to `path`, replacing the shell command search path.

### Fix

Reran the loop with `item` as the variable name.

### How to avoid next time

Do not use `path` as a shell variable in zsh scripts or one-off loops; use names
such as `item` or `file_path` instead.

## 2026-08-21 — Partial install hid the stylelint binary

### Symptom

`pnpm lint` completed ESLint but failed during the CSS phase with
`stylelint: command not found`, even though `stylelint` was declared in the root
manifest and lockfile.

### Cause

The workspace `node_modules` directory was incomplete and did not contain the
locked dev dependency.

### Fix

Ran `pnpm install --frozen-lockfile --ignore-scripts` to restore the locked
workspace dependencies without changing `pnpm-lock.yaml`.

### How to avoid next time

After switching worktrees or restoring a partial workspace, run the frozen
install before treating a missing declared binary as a code or configuration
failure.

## 2026-08-06 — Assumed Dependabot config key from training data (auto-merge)

### Symptom

Added `auto-merge: true` to two update blocks in `.github/dependabot.yml`. CI
went green (lint/type-check/tests don't validate Dependabot config), but the
key is not part of the Dependabot schema (`additionalProperties: false` on
update entries). Dependabot would have rejected the entire config file after
merge and stopped opening version-update PRs entirely — the opposite of the
PR's stated goal. The breakage surfaces silently as PRs that never appear.

### Cause

Wrote config based on pre-trained knowledge without verifying against the
service's actual schema. The `auto-merge: true` key was carried over from
Renovate's config (which _does_ have an `automerge` key at the package-rule
level) — the issue title "Renovate **or** Dependabot" primed the assumption
that the two tools had interchangeable config concepts. Neither Context7, the
JSON schema at `json.schemastore.org/dependabot-2.0.json`, nor the GitHub
docs page was consulted before committing.

### Fix

Reverted `.github/dependabot.yml` to the committed state and added
`.github/workflows/dependabot-automerge.yml` instead — a workflow that
triggers on Dependabot-opened PRs and calls `gh pr merge --auto --squash` to
enable GitHub's native auto-merge. Auto-merge fires only after all required
checks pass; the workflow is the mechanism Dependabot actually supports.

### How to avoid next time

When writing config for an external service or library, validate keys/shape
against the service's current docs or JSON schema — Context7, schemastore,
or official docs — not pre-trained knowledge. Two tools with similar
surfaces (Renovate vs Dependabot) do not have interchangeable config
contracts. CI does not catch this class of error: lint/type-check/tests
don't parse `.github/dependabot.yml`, so the failure mode is silent and
post-merge.

### Evidence

- PR #176, review comment: https://github.com/snaveevans/pineapple/pull/176#issuecomment-5209057744
- Fix commit: `eeca7e9` on branch `chore/125-automated-dependency-updates`
- Schema: https://json.schemastore.org/dependabot-2.0.json (`additionalProperties: false` on update entries)

## 2026-08-17 — Flaky `AppAssets.test.tsx` only under the root `pnpm test` / pre-push hook

### Symptom

`git push` failed via the `pre-push` husky hook (`pnpm type-check && pnpm test`,
where root `test` is a bare `vitest run` across the whole workspace in one process)
with `TypeError: Cannot read properties of undefined (reading 'clear')` at
`window.localStorage.clear()` in `apps/web/src/app/AppAssets.test.tsx`'s
`beforeEach`, failing all 5 tests in that file. The diff being pushed touched zero
`.ts`/`.tsx` files (CSS-only change), and `pnpm --filter @snaveevans/pineapple-web
test` (the per-package run, using `apps/web`'s own `vitest.config.ts`) passed
108/108 every time. Re-running the identical root-level `vitest run` command
repeatedly on the identical committed tree passed twice, failed once, passed
again — confirmed non-deterministic, not content-driven (also reproduced,
inconsistently, on a clean `origin/main` checkout).

### Cause

Not fully root-caused. Likely a `window.localStorage` initialization race specific
to running the full ~101-file / 620-test suite in one Vitest process from the
repo root (root `vitest.config.ts` has no explicit `environment`/`setupFiles` —
it only excludes `.claude/**` worktrees), vs. the per-package config that always
passed. Only ever seen in this one file/suite combination.

### Fix

Retried the push (`git push`) without changing any code — passed on the next
attempt. Did **not** use `--no-verify`.

### How to avoid next time

If `pnpm push` / the pre-push hook fails specifically in `AppAssets.test.tsx`
with a `window.localStorage` `TypeError`, and your diff doesn't touch any
`.ts`/`.tsx` files, don't chase it as a real regression — confirm via
`pnpm --filter @snaveevans/pineapple-web test` (should pass), then retry the
push once or twice. If it's still red after 2-3 tries, treat it as a genuine
regression and investigate further; this entry is about the known-flaky case,
not a blanket license to retry-until-green.

### Evidence

- Branch `stylelint` (issue #148), local session: root `vitest run` outcomes on
  the same commit, in order: fail (5/5 `AppAssets.test.tsx` tests) → pass
  (101/101) → pass (101/101) → fail (same 5 tests) → pass (101/101, pushed).
