# Pitfalls (errors + fixes)

This file is a running log of small-but-annoying issues we've hit, plus the fix that worked.

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
