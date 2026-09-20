---
description: Open a PR with issue link and repo template filled in
---

Open a pull request for the current work. User input: $ARGUMENTS

Follow the PR conventions in @CLAUDE.md (Workflow) and the template in
@.github/pull_request_template.md.

## Preconditions

1. Run `git status`, `git diff`, and `git log` against the base branch. Confirm we are **not** on `main`.
2. Require `pnpm verify` to pass. Run separate `pnpm test:e2e` when the approved evidence plan or path scope requires it; record a successful docs-only skip accurately.
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
- **Body:** fill the project PR template in `.github/pull_request_template.md`:
  - Summary (1–3 bullets from the actual diff)
  - Related (`Closes` / `Fixes` / `Refs` as decided)
  - **Risk** — level `L|M|H|C`, why, and human validation budget (see
    `validation-gate` skill hybrid rubric). Prefer running that skill for a full
    gate; if opening a PR bare, still score risk honestly from the diff paths.
  - **Intent / Spec / Evidence** — accepted intent + affected IDs for a
    feature/change, or the corrective issue for a bug; include the spec target
    and claim → named proof → result → remaining uncertainty. State a
    behavior-preserving exception explicitly.
  - Test plan (concrete steps, not empty checkboxes only)
  - Validation gate checklist + escalations when the gate was run
- Push the branch if needed, then create the PR with `gh pr create`. If updating an
  already-pushed branch after a rebase, use `git push --force-with-lease` (your own
  feature branch only; never force-push `main` or a protected branch). Committing and
  pushing are autonomous; the human verifies the reported evidence before
  explicitly approving **merge**.
- Prefer a ready PR; use `--draft` only if the user asked or CI/tests were skipped.

## Output

Return the PR URL. Reminder: after merge of a feature slice, run
`docs/specs/prompts/pr-sync.md` against the diff.
