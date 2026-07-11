---
description: Open a PR with issue link and repo template filled in
---

Open a pull request for the current work. User input: $ARGUMENTS

Follow the PR conventions in @CLAUDE.md (Workflow) and the template in
@.github/pull_request_template.md.

## Preconditions

1. Run `git status`, `git diff`, and `git log` against the base branch. Confirm we are **not** on `main`.
2. Prefer that checks already passed: `pnpm lint && pnpm type-check && pnpm -r test`. If the user wants a draft or the suite is slow, note what was skipped.
3. If the API contract changed, ensure OpenAPI was regenerated.

## Issue number

Resolve the GitHub issue number from, in order:

1. Explicit number in `$ARGUMENTS`
2. Leading digits in the branch name (`feat/42-…` → `42`)
3. Commit footers (`Closes #N` / `Refs #N` / `Fixes #N`)
4. Ask the user if still unknown and an issue is likely

If there is no issue, omit the Related section.

## Link mode

- Default to **`Closes #N`** (or **`Fixes #N`** for pure bugfix branches) when this PR fully resolves the issue.
- Use **`Refs #N`** when this is a partial slice, or when `$ARGUMENTS` says partial / slice / WIP.
- Never invent an issue number.

## PR contents

- **Title:** concise, imperative; optional `(#N)` suffix when linked.
- **Body:** fill the project PR template:
  - Summary (1–3 bullets from the actual diff)
  - Related (`Closes` / `Fixes` / `Refs` as decided)
  - Test plan (concrete steps, not empty checkboxes only)
  - Spec / AC link when feature work touched `docs/specs/`
- Push the branch if needed, then create the PR with `gh pr create`.
- Prefer a ready PR; use `--draft` only if the user asked or CI/tests were skipped.

## Output

Return the PR URL. Reminder: after merge of a feature slice, run
`docs/specs/prompts/pr-sync.md` against the diff.
