---
audience: all contributors
purpose: canonical verification contract and mutation-testing gate for feature specs
source: this file
date: 2026-07-23
---

# Testing & Verification — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** All features with logic in `apps/api/src/domain/**` or `apps/api/src/application/**`

> The mutation gate is live as the `Mutation` workflow (`.github/workflows/mutation.yml`),
> tracked by [#86](https://github.com/snaveevans/pineapple/issues/86). The decision behind it is
> [ADR-0016](../../decisions/0016-mutation-testing-as-the-ci-trust-boundary.md).

---

## Summary

`main` auto-merges on green CI with `required_approving_review_count: 0`, so **CI is the entire
trust boundary** and the test suite is not merely the author's safety net — it is the merge gate.
Lint and type-check catch structural faults; nothing else measures whether tests _assert_
behavior or merely _execute_ it, and coverage cannot answer that question.

**Mutation testing is the check that closes the gap.** Stryker mutates the pure-logic layers and
reports what fraction of mutants the suite kills. A floor is enforced in CI, and that floor only
moves up.

## Canonical Behavior

### The gate

- Mutation testing runs against `apps/api/src/domain/**` and `apps/api/src/application/**`.
  `apps/api/src/infrastructure/**` is excluded per ADR-0016 — mutating D1 glue is slow and
  mostly re-asserts what the database already guarantees.
- **`thresholds.break` is `68`.** CI fails when the mutation score drops below it.
- **Rationale for 68:** the measured baseline on 2026-07-23 was **70.82%** (1518 mutants: 1073
  killed, 281 survived, 162 no-coverage). The floor sits ~3 points under the measurement to
  absorb run-to-run variance and the 2 timeout-prone mutants observed, so the gate does not fail
  spuriously. It is a floor against regression, not a target.
- The score enforced is Stryker's **overall mutation score**, which counts no-coverage mutants in
  the denominator. `thresholds.break` cannot key off the covered-code score (79.28% at baseline),
  so untested code drags the enforced number — deliberately.

### Ratchet policy

- **The floor is never lowered.** Not to make CI green, not temporarily.
- When work raises the score materially, **raise `thresholds.break` in the same PR** to just under
  the newly measured score. The ratchet is part of the change that earned it, not a follow-up.
- Lowering the floor, excluding files from `mutate`, or muting a mutator to make a red build green
  are all the same act: gaming the gate. If the gate is genuinely wrong, change it deliberately and
  say so in Exceptions.

### Configuration

Config lives at `apps/api/stryker.conf.json`.

- `mutate`: `src/domain/**/*.ts` and `src/application/**/*.ts`, excluding `src/**/*.test.ts`.
- `coverageAnalysis: "perTest"` — required for the run to stay fast enough to block.
- **pnpm plugin resolution:** `plugins` must point at the runner's entry file directly:
  `"./node_modules/@stryker-mutator/vitest-runner/dist/src/index.js"`. pnpm's isolated
  `node_modules` hides the plugin from Stryker's child process when referenced by module name,
  failing with `Cannot find TestRunner plugin "vitest"`.
- **No `@stryker-mutator/typescript-checker`.** The source-first ESM TypeScript setup (explicit
  `.ts` import extensions, no build step) instruments and runs as-is — 0 compile and 0 runtime
  errors across the baseline run.

### Mutator policy

- **All mutators are enabled** for now. Tuning is deferred until the gate has run for a full cycle
  in anger (see Known Issues).
- **Error-message copy is not a contract.** `StringLiteral` mutants that blank an error message
  (`new NotFoundError("Asset not found")` → `""`) are expected survivors. Assert the error _type_
  and `field`, never the prose. If these come to dominate triage, tune the mutator — do not write
  assertions that freeze copy.
- **Discriminant and status strings _are_ contract.** Values that drive control flow downstream —
  `"sent"` / `"suppressed"` / `"already_processed"`, `retryable` flags, status labels — must be
  asserted.

### CI wiring

- Runs as a **separate job from the hot `verify` path**, which must stay fast.
- **Blocking on pull requests** that touch `apps/api/src/domain/**` or
  `apps/api/src/application/**`, path-filtered so unrelated PRs are unaffected.
- **A scheduled full run against `main`** backstops what the path filter misses.
- The HTML/JSON reports are build artifacts. They are generated into `apps/api/reports/mutation/`
  and are **not committed** (gitignored, along with `.stryker-tmp/`).

## Feature Integration Contract

Every feature that adds or changes logic in `domain/**` or `application/**` must:

- **Write acceptance criteria that a mutation would break.** State the rule behaviorally, so a
  test asserting it fails when the rule is inverted or removed. A criterion that can pass without
  asserting the rule ("returns without throwing", "renders the list") is too weak to gate on.
- **Assert outcomes, not execution.** Check returned values, error types, emitted event payloads,
  and computed numbers — not merely that the code path ran.
- **Not lower the mutation floor.** If a change drops the score, add the missing assertions. If
  the drop is legitimate and unavoidable, record it in Exceptions with a reason — do not lower
  `thresholds.break`.
- **Raise the floor in the same PR** when the change materially improves the score.
- **Not pin error-message copy** to kill a mutant. See Mutator policy.

## Exceptions

| Feature | Deviation | Reason |
| ------- | --------- | ------ |

## Anti-Patterns

- **Lowering `thresholds.break` to make CI green.** The floor exists precisely to make this
  visible. Add assertions instead.
- **Excluding a file from `mutate` to raise the score.** Scope changes are decisions, not
  build fixes.
- **Freezing error prose in an assertion** to kill a `StringLiteral` mutant. This degrades the
  suite it is meant to protect — the test now fails on harmless copy edits and still asserts
  nothing about behavior.
- **Shaping production code to satisfy a mutator.** Per ADR-0016, if passing the gate requires
  changing production code rather than tests, that is a defect in the gate's configuration.
- **Reaching through infrastructure to test domain logic.** Domain and application tests are pure
  and run outside the Workers runtime; exercising D1 to cover a business rule is slow and
  low-signal.
- **Reading a high mutation score as correctness.** It proves the tests pin the behavior the code
  _has_, not that the behavior is the one intended. A well-asserted wrong rule still ships.

## Known Issues

- **Mutator tuning is deferred.** At baseline, 84 of 281 survivors were `StringLiteral`, largely
  error-message copy that we deliberately do not pin. Whether to disable the mutator for error
  paths, scope it, or accept the noise is an open decision to revisit after one full cycle of use.
- **The floor is depressed by untested code.** 162 no-coverage mutants at baseline, including two
  use cases (`GetAsset`, `ListActivity`) scoring 0% because no test exercises them
  ([#91](https://github.com/snaveevans/pineapple/issues/91)). These count against the enforced
  score; clearing them is the cheapest available lift.
- **Test-tightening backlog:** [#91](https://github.com/snaveevans/pineapple/issues/91)–[#98](https://github.com/snaveevans/pineapple/issues/98)
  track the located weak spots, ranked by high-signal survivors.
  [#95](https://github.com/snaveevans/pineapple/issues/95) (shared-asset access scoping) is
  security-relevant.
- **The gate is partial.** `apps/api/src/api/**`, `apps/api/src/infrastructure/**`, and all of
  `apps/web` are ungated. A green mutation check is not a statement about those layers.
- **Run time grows with the codebase.** The baseline run was ~80s for 1518 mutants at
  `concurrency: 4`. If the blocking path becomes a drag on iteration, ADR-0016's revisit trigger
  applies.
