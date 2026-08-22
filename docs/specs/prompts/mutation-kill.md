# Prompt: Kill mutation survivors (test-only)

Reusable process for issues that raise the mutation baseline by tightening
assertions — backlog [#91](https://github.com/snaveevans/pineapple/issues/91)–[#98](https://github.com/snaveevans/pineapple/issues/98).
Policy: [docs/specs/cross-cutting/testing.md](../cross-cutting/testing.md),
[ADR-0016](../../decisions/0016-mutation-testing-as-the-ci-trust-boundary.md).

---

## Hard constraints (do not violate)

1. **Tests only.** Edit or create `*.test.ts` under `apps/api/src/domain/**` or
   `apps/api/src/application/**`. Do **not** change production source, Stryker
   config, `thresholds.break`, mutators, or `mutate` globs.
2. **One issue = one branch = one PR.** No drive-by refactors, renames, or
   unrelated coverage.
3. **Assert outcomes, not execution.** Returned values, error **types** +
   `field`, event **payloads**, computed numbers, status/retryable contracts.
4. **Never pin error-message prose.** `StringLiteral` survivors on error copy
   are expected — kill type/field/behavior mutants only.
5. **Do not raise `thresholds.break`.** Concurrent kill-PRs race on the floor;
   a separate ratchet lands after several merge.
6. **Pure unit tests.** In-memory fakes for ports; no D1, no Workers runtime.
7. **Match existing style.** Co-located `Foo.test.ts`, vitest, branded IDs via
   `.from()` / `.generate()`, `Result` via `result.ok` then value/error, fake
   repos like neighboring tests.

## Inputs (fill per issue)

| Field               | Value                  |
| ------------------- | ---------------------- |
| Issue               | `#N` — title           |
| Target files        | (from issue body)      |
| Acceptance criteria | (checklist from issue) |
| Sample survivors    | (from issue body)      |
| Worktree (if any)   | absolute path          |

## Process

### 0. Isolate

```bash
# Prefer a dedicated worktree so parallel agents never thrash the same checkout.
git fetch origin main
git worktree add -b test/N-short-slug /path/to/worktree origin/main
cd /path/to/worktree
pnpm install
```

Branch regex: `test/{issue}-{slug}` e.g. `test/91-cover-get-asset-list-activity`.

### 1. Orient (read before writing)

1. Full issue body + acceptance criteria.
2. Each target **source** file (understand branches under test).
3. Existing co-located `*.test.ts` and 1–2 sibling use-case/domain tests for
   fake/assert patterns.
4. `docs/specs/cross-cutting/testing.md` mutator policy (status strings **are**
   contract; error prose is **not**).
5. Relevant feature/cross-cutting specs only if needed for intended behavior
   (e.g. permissions for #95, Smart Events ADR-0010 for #97).

### 2. Write tests that kill high-signal mutants

For each acceptance criterion and each sample survivor:

| Mutant class                             | What the test must prove                             |
| ---------------------------------------- | ---------------------------------------------------- |
| `ConditionalExpression` → `true`/`false` | Both sides of the guard (grant **and** deny)         |
| `EqualityOperator` `>` ↔ `>=` etc.       | Exact boundary: in-bound valid, out-of-bound invalid |
| `BooleanLiteral` flip                    | The flag’s real value matters to the caller          |
| `ObjectLiteral` → `{}`                   | Every required payload field is present and correct  |
| `ArrayDeclaration` → `[]` / filler       | Empty vs non-empty branch outcomes differ            |
| `UpdateOperator` `++` → `--`             | Exact counts, not “key exists”                       |
| `ArithmeticOperator`                     | Direction and clamping with concrete dates/numbers   |
| `NoCoverage`                             | At least one test executes the path **and** asserts  |

Patterns that **fail** this work:

- `expect(result.ok).toBe(true)` with no value checks
- Asserting only `events[0].type` without payload fields
- Asserting error `.message` strings
- Happy-path only when the survivor is a removed deny guard

### 3. Verify

```bash
# Fast loop while writing (scope to touched tests / units)
pnpm --filter @snaveevans/pineapple-api exec vitest run path/to/File.test.ts

# Full package tests before PR
pnpm --filter @snaveevans/pineapple-api test

# Optional but preferred: confirm target files lost NoCoverage / high-signal survivors
# Full suite ~80s+. If too heavy, at least ensure new tests fail when you
# temporarily invert the production guard, then revert the guard (do not commit
# production edits).
pnpm --filter @snaveevans/pineapple-api test:mutation
```

Also run when practical:

```bash
pnpm lint && pnpm type-check
```

### 4. Ship

```bash
git status   # only *.test.ts (and nothing else)
git log origin/main..HEAD --oneline
# commit — end with Co-Authored-By trailer per AGENTS.md
git push -u origin HEAD

gh pr create --base main --title "test: …" --body "$(cat <<'EOF'
## Summary

- <what assertions were added and which mutants they target>

## Related

Closes #N

## Test plan

- [x] `pnpm --filter @snaveevans/pineapple-api test` green
- [x] New/updated tests assert values, error types, payloads — not merely execution
- [ ] CI `verify` + `mutation` green

## Spec / AC

Issue #N acceptance criteria:

- [x] …
EOF
)"
```

PR title style: `test: <issue slug>` matching the issue intent.
Do **not** merge. Stop after the PR URL is printed.

## Done definition

- [ ] Every issue AC checked off in the PR body with evidence in tests
- [ ] Diff is test-only
- [ ] Branch `test/N-…`, PR `Closes #N`
- [ ] No change to `stryker.conf.json` / production sources
- [ ] Agent final message: PR URL + brief list of files touched

## Anti-collusion / honesty

- Do not weaken production code to make tests easier.
- Do not delete or skip existing tests to green the suite.
- If an AC cannot be met without a production change, **stop**, open a comment
  on the issue explaining why, and leave the PR as draft or do not open one.
- If two target files share helpers, keep helpers inside the test file or a
  test-only pattern already used nearby — still no production edits.
