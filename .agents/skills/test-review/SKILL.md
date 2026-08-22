---
name: test-review
description: Adversarial review of tests against the feature spec and the GitHub issue test plan. Checks leftover spies, exact error strings, auth-before-parse, and boxes checked too early. Use after spec-implement, before validation-gate, or whenever the user asks whether the tests actually pin the spec, to review coverage, or to test-review an issue or branch. Do not use to write a blind plan (test-author), implement the slice (spec-implement), or review production code for bugs (pr-review).
---

# Test review

Finds holes in the **tests**, not in the handler. `test-author` was blind on
purpose. This skill is the one allowed to read `packages/**` test files and
say whether they pin the contract.

This skill sits **between** `spec-implement` and `validation-gate`. Specs own
behavior. The issue comment owns the plan. Tests must prove both.

## Identify, don't fix

This skill finds problems. It does not solve them. Do not edit test files,
production code, or the spec. Do not suggest patches or "extract a helper."
State what is missing or lying, and the consequence (a leftover row would
still go green; a box is checked without a spy).

A finding is complete when a reader knows the gap and what it would let ship.

## Find the target

Do not expect an argument. Resolve issue and spec from, in order:

1. Explicit issue / spec / PR in the user request
2. Delivery Plan `Issue` cell on the spec this branch touches
3. Leading digits in the branch name (`feat/5-…` → `#5`)
4. Ask if still ambiguous

Then **run this**:

```bash
gh issue view <N> --comments
find docs/specs/features docs/specs/cross-cutting -name "*.md" | sort
git diff --name-only main...HEAD -- '*test*' '*spec*'
```

Load:

- The feature spec and every Related Spec it lists
- The **latest** issue comment containing `<!-- openbrain-test-author -->`
- Test files in the branch diff (and existing tests for the same feature on
  this branch — not production handlers unless a test is unreadable without
  the assertion target)

If there is **no plan comment**, stop and hand back to `test-author`.
Reviewing tests against vibes is how we re-derive the plan.

State in one line: issue, spec path, plan comment URL, and which test files
you will read.

## 1. Build the expected set

From the spec, list every acceptance criterion tagged for this slice and every
Edge Cases / Observable Contract row that is caller-visible.

From the issue plan, list every **Minimum confidence set** item and every
**P0** row. Treat those as required. P1 is a finding only when the user asked
for a full pass, or when skipping it would let a P0 failure hide (wrong error
string reused, leftover unspied).

Do not add new product policy. If the spec and the plan disagree, that is
itself a finding — hand back to `test-author`, do not pick a winner.

## 2. Read the tests

Read the test files. You may skim fakes/helpers they import. Stay out of
handler source unless you cannot tell what an assertion is pointing at.

For each required item, record one of:

| Verdict              | Meaning                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Pinned**           | A test would fail if the behavior regressed the way the plan fears                                            |
| **Status-only**      | A status/body check exists, but the expensive part (leftover row, embedder input, key-on-row) is not asserted |
| **Wrong string**     | Test expects a message that belongs to a different case                                                       |
| **Missing**          | No test                                                                                                       |
| **Contradicts spec** | Test encodes a different contract than the spec / plan                                                        |
| **Box lie**          | Spec box is `[x]` and the matching test is missing, status-only, or contradicts                               |

Work through [pin-checklist.md](pin-checklist.md). That list is the difference
between "we have a 500 test" and "a leftover row would fail CI."

## 3. Score findings

Keep a finding when it is **real and would let a ship-blocker through**. Drop
nits (test names, extra P2 coverage, style).

Typical keepers:

- Minimum-confidence or P0 item is Missing or Status-only
- Dual-write `500` test does not assert leftover state on **every** store
- Auth test does not prove **before parse** (401 on invalid JSON / empty
  content)
- Error string reused for a different case
- Attacker-supplied server fields not shown to bounce
- Oversize path allows stored text ≠ embedded text
- Spec box `[x]` without a pinning test
- New observable behavior in tests that the spec never recorded

## 4. Report in-session

Verdict:

- **Changes requested** — any keeper. The slice is not done.
- **Approved** — every minimum-confidence item and every new AC is Pinned; no
  box lies.

```markdown
## Test review: changes requested | approved

Issue #<N> · <spec path>
Plan: <comment URL>

### Unpinned (required)

- **<plan/spec item>** — Missing | Status-only | Wrong string | …
  What the current test actually asserts, and the bug that would stay green.

### Box lies

- `docs/specs/…` — `[x]` without a pinning test / …

### Plan vs spec disagreements

- …

### Pinned (for the record)

- Short checklist of required items that are actually pinned.

### Not scored

P1/P2 you looked at and left alone, or parked product calls.
```

On approval, keep Unpinned / Box lies empty and say in one line what the tests
would catch.

Do **not** post this on the PR. `pr-review` owns PR comments. Fold survivors
into the `validation-gate` evidence / escalations when that skill runs.

## What this skill is not

- Not `test-author` — do not invent a new plan or edit the spec
- Not `pr-review` — do not review handler bugs or architecture
- Not `spec-implement` — do not write the missing tests
- Not a coverage-percentage check. One leftover-state spy beats twenty
  duplicate `201` tests
