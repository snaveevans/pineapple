---
description: Create a feature/fix branch using repo naming conventions
---

Start work on a new branch for: $ARGUMENTS

Follow the branch workflow in @CLAUDE.md (Workflow → Branch naming).

## Parse input

Accept freeform text. Extract:

1. **type** — one of `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`, `test`, `perf`. Infer from intent if omitted (`feat` for new behavior, `fix` for bugs).
2. **issue** — optional GitHub issue number (digits only). Include only if the user gave one or a clear issue reference.
3. **slug** — short lowercase kebab-case summary of the work.

## Branch name

- With issue: `{type}/{issue}-{slug}`
- Without: `{type}/{slug}`

Must match:

```
^(feat|fix|docs|refactor|chore|ci|test|perf)/(?:[0-9]+-)?[a-z0-9]+(?:-[a-z0-9]+)*$
```

No `#` in the branch name.

## Steps

1. Confirm current branch is clean enough to branch from (prefer up-to-date `main`).
2. Create and check out the new branch from `main` (fetch/pull if needed).
3. State the **one-sentence concern** and rough scope budget (files/areas). Ask the user if the concern is ambiguous.
4. Do **not** implement yet unless the user also asked to implement — stop after the branch exists and scope is named.

## Output

Report: branch name, base, one-sentence concern, and whether an issue will be linked as `Closes` vs `Refs` when the PR is opened.
