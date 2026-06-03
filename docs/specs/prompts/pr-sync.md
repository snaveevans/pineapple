# Prompt: Pre-Merge Spec Check

Use this prompt before merging a PR to verify the proposed changes are
consistent with the feature spec. If violations are found, either fix the code
or explicitly update the spec as part of the PR.

Paste the prompt below, then append the existing feature spec and the PR diff
or description.

---

You are checking a PR against a feature spec before it merges.

## Inputs

- Feature spec (provided, with line numbers)
- PR diff or description (provided)

## Task

For each meaningful change in the PR, classify it:

- **VIOLATION** — PR behavior contradicts a specific spec line; flag it
- **GAP FILLED** — PR adds behavior the spec doesn't cover; spec needs a new entry
- **IMPLEMENTATION DETAIL** — no observable behavior change; spec unaffected

## Output

Return exactly two sections:

### Violations & Gaps

For each VIOLATION: cite the spec line number(s), quote the relevant spec text,
and describe how the PR contradicts it.
For each GAP FILLED: describe the new behavior that should be added to the spec.
If none, write "None."

### Implementation Details

List changes classified as IMPLEMENTATION DETAIL.
If none, write "None."
