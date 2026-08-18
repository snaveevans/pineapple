---
audience: all contributors
purpose: canonical verification contract — mutation gate (API), CSS token lint gate (web)
source: this file
date: 2026-08-15
---

# Testing & Verification — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** API logic in `apps/api/src/domain/**` and `apps/api/src/application/**` (mutation gate); stylesheets in `apps/web/src/**/*.css` (CSS token lint gate)

> The mutation gate is the `Mutation` workflow (`.github/workflows/mutation.yml`), with `mutation`
> a required status check on `main`. Tracked by [#86](https://github.com/snaveevans/pineapple/issues/86).
> The decision behind it is
> [ADR-0016](../../decisions/0016-mutation-testing-as-the-ci-trust-boundary.md).
>
> The CSS token lint gate runs as `lint:css` inside the root `pnpm lint` script (part of the `verify`
> job's required `Lint` step — no separate CI job). Tracked by
> [#148](https://github.com/snaveevans/pineapple/issues/148) (epic
> [#143](https://github.com/snaveevans/pineapple/issues/143)). No ADR: the issue itself already
> fixed the tool (stylelint, the only real choice for linting plain CSS) and the banned patterns —
> there was no live alternative to weigh.

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
  killed, 2 timeout, 281 survived, 162 no-coverage). Timeouts count toward the score as killed
  (`(1073+2)/1518`). The floor sits ~3 points under the measurement to absorb run-to-run
  variance, so the gate does not fail spuriously. It is a floor against regression, not a target.
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

- Runs as a **separate workflow** (`.github/workflows/mutation.yml`) from the hot `verify`
  path, which must stay fast. The job name is `mutation` — that is the required status-check
  context on `main`.
- **Always reports a status on every PR** so it can be a required check without deadlocking
  unrelated work. The expensive Stryker run is path-scoped; when scope is untouched the job
  exits green without installing or mutating.
- **Run scope (fail closed):** logic lives in `.github/scripts/mutation-{scope,decide}.sh`
  (self-tested by `.github/scripts/mutation-scope.selftest.sh` on every `verify` run). The full
  suite runs when the PR touches any of:
  - `apps/api/src/domain/**`
  - `apps/api/src/application/**`
  - `packages/shared/**` (domain/application import branded IDs, `Result`, `DomainError`)
  - `apps/api/stryker.conf.json`
  - `apps/api/package.json`
  - `apps/api/vitest.config.ts` (Stryker runner discovery / which tests kill mutants)
  - `apps/api/tsconfig.json` (esbuild transform settings for instrumentation)
  - `pnpm-lock.yaml`
  - `.github/workflows/mutation.yml`
  - `.github/scripts/mutation-*.sh`

  Dependency and config changes are in scope because they can move the score. If the diff
  cannot be computed, the suite runs rather than silently skipping.

- **A scheduled full run against `main`** (daily) backstops what the PR path filter misses.
  On `refs/heads/main` only, schedule/dispatch failures (including infra failure before the
  suite runs) open or comment on a single sticky GitHub issue with the `mutation-gate` label —
  the label is created idempotently in the workflow. A subsequent green mutate step closes it.
  Upload-only failures after a green suite do not page. Dispatch on a non-`main` ref does not
  open issues. PR-path failures already block merge and do not open issues. Concurrent
  schedule/dispatch runs on `main` queue rather than cancel each other.
- The HTML/JSON reports are build artifacts. They are generated into `apps/api/reports/mutation/`
  and are **not committed** (gitignored, along with `.stryker-tmp/`).
- **Local command:** `pnpm --filter @snaveevans/pineapple-api test:mutation`.

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
  `apps/web` are ungated by mutation testing. A green mutation check is not a statement about those
  layers. There is currently no automated verification of frontend appearance — a Playwright-based
  state gallery + visual-diff check existed under issue #143 but was removed as low-value and flaky
  for this team's scale; `docs/web/FEATURES.md`'s state catalog remains as documentation only.
- **Run time grows with the codebase.** The baseline run was ~80s for 1518 mutants at
  `concurrency: 4`. If the blocking path becomes a drag on iteration, ADR-0016's revisit trigger
  applies.

---

## CSS token lint gate

**Status:** `active`
**Tracked by:** [#148](https://github.com/snaveevans/pineapple/issues/148) (epic
[#143](https://github.com/snaveevans/pineapple/issues/143))
**Depends on:** [#147](https://github.com/snaveevans/pineapple/issues/147) — token consolidation
into `apps/web/src/design/styles/tokens.css` (merged; there was nothing to enforce against before
it)

`--hf-brand`, `--hf-r`, and the rest of `tokens.css` are the branded types of the frontend:
`UserId.from()` exists so a raw string can't slip into a `UserId` field; the token file exists so
`oklch(45% 0.1 150)` can't slip into a component stylesheet as a shadow copy of the brand color.
Before this gate, that discipline was documentation only. `main` auto-merges on green CI with zero
required reviewers, so an unenforced convention drifts back the moment a fast model (or a human in
a hurry) reaches for a literal instead of a token — exactly what #147 measured and fixed once
already.

### What it is

- **Tool:** `stylelint`, config at repo-root `stylelint.config.js`, scoped to
  `apps/web/src/**/*.css`. `apps/api` has no stylesheets and is untouched.
- **Three rules, not a general style ruleset.** This gate does not adopt
  `stylelint-config-standard` or any formatting/quality rule set — only the token-discipline rules
  below. Broader CSS style linting is out of scope for #148 and would be its own decision.
  - `color-no-hex: true` — bans `#fff`-style literals.
  - `function-disallowed-list: ["oklch", "rgb", "rgba", "hsl", "hsla"]` — bans every raw color
    function. Only `oklch`/`rgb`/`rgba` had live usage at merge; `hsl`/`hsla` are banned
    pre-emptively so a future contributor can't route around the other four through the one
    unlisted function name.
  - `declaration-property-value-disallowed-list` on `border-radius` and its four per-corner
    longhand properties, against `/^(?=.*px)(0|\d+(\.\d+)?px)(\s+(0|\d+(\.\d+)?px)){0,3}$/` — bans
    any 1-4-value shorthand built from bare px lengths and unitless `0` (catches both
    `border-radius: 8px` and `border-radius: 22px 22px 0 0`), but requires at least one `px`
    component so a plain `border-radius: 0` reset isn't forced through a token — there's no radius
    scale concept for "no rounding." `50%` (circles) never matches (no `px`) and needs no carve-out.
    `999px`-style pill radii do match and are tokenized (`--hf-r-full`) where they recur.
- **`tokens.css` is exempt**, via a stylelint `overrides` block scoped to that one file path — it
  is the declaration site, so the rules that ban literals everywhere else would be
  self-contradictory there.
- **Wired into `pnpm lint`** (root `lint` script runs `eslint .` then `lint:css`) and into
  `lint-staged` (`apps/web/src/**/*.css` → `stylelint`). No separate CI job: it rides the
  existing required `Lint` step in the `verify` job, the same way ESLint does.
- **No `prettier --write` in the CSS `lint-staged` entry, deliberately.** Two hand-authored
  files (`mr.css`, `hifi-add-service.css`) predate any Prettier run against `apps/web`'s CSS and
  use a denser multi-declaration-per-line style; Prettier's canonical CSS output is always one
  declaration per line, so running `--write` on either explodes the whole file (~3x line count)
  on the first touch — confirmed by bisecting down to `.mr-root { position: relative; }` alone
  reformatting to 3 lines. CI has never enforced CSS formatting (no `format:check` step touches
  `apps/web/src/**/*.css`), so adding `prettier --write` here would be scope creep unrelated to
  token discipline, landing as an unreviewable full-file diff on whichever PR happens to touch
  one of those two files next. If CSS formatting enforcement is wanted, that's a separate,
  deliberate decision — not a side effect of this gate.

### The escape hatch

A genuine one-off stays a literal, guarded by a reason (real example, `marketing.css`):

```css
/* stylelint-disable function-disallowed-list -- one-off glass-button treatment on the CTA hero, matches the issue's documented "marketing hero collage" precedent for genuine one-offs */
.mk-cta-box .mk-btn-ghost {
  background: transparent;
  color: var(--hf-on-brand);
  border-color: oklch(100% 0 0 / 0.28);
}
.mk-cta-box .mk-btn-ghost:hover {
  background: oklch(100% 0 0 / 0.08);
  border-color: oklch(100% 0 0 / 0.5);
}
/* stylelint-enable function-disallowed-list */
```

A block `stylelint-disable`/`stylelint-enable` pair is needed whenever the violation isn't on the
line immediately after the comment (e.g. inside a multi-line `box-shadow` or `background`) —
`stylelint-disable-next-line` only covers the literal next line, so a comment placed one line too
early silently disables nothing and `reportNeedlessDisables` catches it.

- **`reportDescriptionlessDisables: true`** — a `stylelint-disable` comment with no `-- reason`
  is itself a lint error. The escape hatch cannot be used silently.
- **`reportNeedlessDisables: true`** — a disable comment covering a rule that wasn't actually
  going to fire is also an error, so a stale disable (left behind after a later edit removed the
  violation) doesn't survive unnoticed.
- **`reportInvalidScopeDisables: true`** — a disable comment naming a rule this config doesn't
  configure is an error, catching a typo'd rule name that would otherwise silently disable
  nothing.

### Anti-patterns

- **Adding a new `--hf-*` token for a value used exactly once.** That's what the disable comment
  is for. A token earns its place by being a real repeated value in the design system, not by
  being the fix-of-least-resistance for one lint error (mirrors the mutation gate's "shaping
  production code to satisfy a check" anti-pattern above).
- **Widening the config to `stylelint-config-standard` (or any formatting rule set) to "finish
  the job."** Out of scope for this gate — a separate decision with its own violation count and
  its own PR.
- **Silencing a violation by broadening the regex or dropping a function from the disallowed
  list.** Same act as lowering the mutation `thresholds.break` — gaming the gate rather than
  fixing the CSS. If the rule is genuinely wrong for a case, that's a disable comment with a
  reason, decided site by site, not a config change that opens the gate for everyone.
- **Leaving the rules disabled with a cleanup TODO.** If the violation count makes a clean
  landing impractical in one PR, split the cleanup by directory and land the rules enabled on the
  final slice — never merge with the gate off.

### Acceptance criteria (#148)

- [x] `pnpm lint` fails when a raw color (`oklch()`/hex/`rgb()`/`rgba()`) is added to a feature
      stylesheet outside `tokens.css`. `S1`
- [x] `pnpm lint` fails on a bare pixel `border-radius` outside `tokens.css`. `S1`
- [x] Zero violations at merge — every literal outside `tokens.css` is either tokenized or carries
      a justified inline disable. `S1`

      Baseline (this branch's `stylelint.config.js` against `origin/main`'s CSS right after #149's
              primitives extraction, 14 stylesheets): **272 violations**, resolved via:

  - **30 new `--hf-*` tokens** in `tokens.css` (status border tints, a `--hf-bad-2`/`--hf-ink-2`
    hover pair mirroring `--hf-brand-2`, 12 activity/event swatches promoted from
    `activity-history.css`'s local — non-`--hf-*` — `--hh-*` properties #147 didn't reach, overlay
    elevation, a `--hf-r-full` pill and a `--hf-r-xl` (20px) tier for hero icons/panel corners
    outside the issue's three named tiers, spinner track, on-brand foreground, two hatch
    textures), each backed by 2+ real repeated sites.
  - **Near-duplicates reconciled into one canonical token**, each disclosed: four drifted
    "bad-border" reds → `--hf-bad-border`; three shadow blur radii → three `--hf-shadow-*`;
    `--hh-spine`/a bad-tone icon bg folded into `--hf-line`/`--hf-bad-bg`; four scrim alphas →
    `--hf-scrim` (majority value); four spinner alphas → `--hf-spinner-track` (split, no
    majority). Also resolves the case #147/#211 explicitly left raw ("close to but not identical
    to a token") — `app-search.css`'s two category-icon tints, each a ≤2-point lightness nudge
    onto the existing token, spot-checked live.
  - **Border-radius scale-snapping** onto the issue's 3 named tiers (plus pill/xl), except two
    sites kept as literals where snapping would be a real shape change:
    `.mr-root .hf-btn` (a comment promises "exact former `.mr-btn` metrics") and
    `.hh-bd-swatch` (a 9×9px dot at 3px — `--hf-r-sm`'s 6px hits CSS's half-side radius cap and
    renders as a circle, not a rounded square).
  - **17 justified inline disables** (decorative textures, the marketing CTA glass effect,
    single-use focus rings, the two geometry exceptions above).
  - **3 dead rules deleted** (`mr.css`'s unreferenced `.brand-green`/`.brand-blue`/`.brand-slate`
    — confirmed via `git grep`/`git log -S`). #147's PR body called these same rules "an
    intentional theme switcher" and left them alone; no issue references that feature, so
    deleting unenforceable dead literals is correct here, but the differing framing is worth a
    reviewer's eyes.
  - **Visual verification:** the Playwright gallery/visual-diff harness (Known Issues, above) was
    removed from `main` mid-implementation. Spot-checked live instead (marketing home, `/login`
    via `vite dev`, console clean) rather than a systematic per-state diff. `S1`

- [x] The rules run in `lint-staged` as well as CI (via `pnpm lint`). `S1`

### Delivery plan

| Slice | Scope                                                                                                                                                                         | Issue | Depends on |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- |
| `S1`  | stylelint added, three rules configured, `tokens.css` exempted, wired into `lint`/`lint-staged`, justified-disable escape hatch, existing codebase brought to zero violations | #148  | #147, #149 |

### Commands

```bash
pnpm lint:css              # stylelint apps/web/src/**/*.css only
pnpm lint                  # eslint . && lint:css — what CI's required Lint step runs
```
