---
audience: all contributors
purpose: canonical verification contract — mutation gate (API) and state gallery (web)
source: this file
date: 2026-08-08
---

# Testing & Verification — Cross-Cutting Spec

**Status:** `active`
**Owner:** engineering
**Applies To:** API logic in `apps/api/src/domain/**` and `apps/api/src/application/**` (mutation gate); renderable web states in `docs/web/FEATURES.md` / `apps/web` (state gallery)

> The mutation gate is the `Mutation` workflow (`.github/workflows/mutation.yml`), with `mutation`
> a required status check on `main`. Tracked by [#86](https://github.com/snaveevans/pineapple/issues/86).
> The decision behind it is
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
  layers. Web appearance is gated separately by the state gallery (below).
- **Run time grows with the codebase.** The baseline run was ~80s for 1518 mutants at
  `concurrency: 4`. If the blocking path becomes a drag on iteration, ADR-0016's revisit trigger
  applies.

---

## Web state gallery

**Status:** `active` (slices 1–2 landed; mutation/content-stress surface remains on #193)
**Tracked by:** [#145](https://github.com/snaveevans/pineapple/issues/145), [#192](https://github.com/snaveevans/pineapple/issues/192) (epic [#143](https://github.com/snaveevans/pineapple/issues/143))
**Harness design source:** [#191](https://github.com/snaveevans/pineapple/issues/191) findings

Frontend appearance has no mutation score. The gallery is the verification contract for
`apps/web` renderable states listed in `docs/web/FEATURES.md`.

### What it is

- A Playwright harness drives the **production** `vite build` output (never `vite dev`).
- The single API seam is `page.route` on `/api/**`. No product-code mocks, no Storybook.
- Each FEATURES.md state is a typed registry entry categorised `rendered` | `deferred` |
  `excluded`. Deferred names the issue that will land it; excluded names the issue that decided
  it will not be photographed.
- Two viewports per rendered state (desktop 1280×800, mobile 390×844), `deviceScaleFactor: 1`.
- Vendored latin variable woff2 fonts (Inter + JetBrains Mono) are committed under
  `apps/web/gallery/fonts/` and served by harness-owned CSS. Google Fonts CDN is blocked.
- **No gallery PNG is ever committed.** Output lives in `apps/web/gallery/out/` (gitignored) and
  ships as a CI artifact with `retention-days: 7`. Primary protection is the gitignore entry;
  CI also fails if any path under `apps/web/gallery/**/*.png` or `apps/web/gallery/out/**` is
  tracked in git (`git ls-files`), so a force-add cannot hide in the pack.

### Coverage check (the point)

A vitest suite derives state IDs from `docs/web/FEATURES.md` and asserts:

1. Every FEATURES id is in the **hand-authored** registry as `rendered`, `deferred`, or
   `excluded`. The registry does **not** auto-synthesize deferred entries from FEATURES —
   a new bullet with no matching entry is a red build.
2. Every registry id exists in FEATURES (renames cannot orphan a fixture).
3. A `[gallery:excluded #N]` / `[gallery:deferred #N]` marker must match the registry category.
4. Markers are stripped before ID derivation — they never enter the id string.
5. Unrecognised FEATURES blocks fail loudly (inline prose blocks are parsed, not skipped).

An ad-hoc screenshot pair that is byte-identical is how silent non-checks ship. The coverage
check exists so a state added to FEATURES without a registry entry is a red build, not a missing
picture nobody notices.

### Determinism levers (minimum set proven by #191)

- `screenshot({ animations: "disabled", caret: "hide", scale: "css", fullPage: true })`
- `locale: "en-US"`, `timezoneId: "UTC"`, process `TZ=UTC`
- `context.clock.install` at a fixed instant
- `deviceScaleFactor: 1`
- Chromium args `--font-render-hinting=none --disable-lcd-text`
- Assert `document.fonts.check("600 16px Inter")` before every shot
- Production build only (no React StrictMode double-invoke)

Two consecutive runs on the **same runner image** must be byte-identical. PNG stability across
GitHub runner image updates is not guaranteed; the visual-diff job (#146) carries a threshold.

### Commands

```bash
pnpm --filter @snaveevans/pineapple-web build
pnpm --filter @snaveevans/pineapple-web gallery:render -- --out apps/web/gallery/out
pnpm --filter @snaveevans/pineapple-web test   # includes gallery coverage check
```

`--out` is required to stay parameterisable: #146 renders merge-base and HEAD into two directories
in one job.

### Feature integration contract

Every change that adds or renames a renderable state in `docs/web/FEATURES.md` must:

- Land a matching registry entry (`rendered`, or `deferred`/`excluded` with an issue number).
- Not commit gallery output.
- Not edit product code solely to make a transient state photographable — open an issue instead
  (precedent: #195 for 401 redirect states).

### Decisions on edge-case states (#192)

1. **States that paint nothing (App Search `Closed`).** Keep them. `Closed` is the resting
   chrome affordance — the search entry point is visible and the overlay is absent. The gallery
   photographs the host page with that resting control, not an empty canvas. A pure unmount with
   no host surface would not belong; that is not this case.
2. **OAuth-redirect / navigate-away flows (Sign In, Onboarding complete).** Photograph only
   stable frames. Sign In `idle`, `in-flight` (social POST held pending so the page never leaves
   the origin), and `error` (`?error=google`) are stable and rendered. Onboarding incomplete forms
   are stable and rendered. Navigate-away transitions (session already established → leave
   `/login`, onboarding complete → leave `/onboarding`) remain non-enumerable per FEATURES.md —
   do not invent a frozen frame, and do not force-capture a tick that unmounts. That is the same
   rule as #195 for 401 redirects.
3. **Load-error UI that is visually identical to loading.** User Profile / Onboarding load
   `error` and Authenticated App Shell profile `error` settle on the same spinner as `loading`
   (no retry affordance in product code). Both IDs stay rendered so coverage stays honest; the
   photos document the current product, not a desired distinct error screen. Shell profile
   `loading`/`error` cold-loads also surface the OnboardingGuard spinner rather than the top-bar
   `?` avatar — the guard shares `userProfileQueryKey` and blocks the shell until me resolves.

### Anti-patterns

- **Committing gallery PNGs.** They bloat the pack forever and are unreclaimable without history
  rewrite. Artifacts only.
- **Driving the gallery through `vite dev`.** Dev StrictMode and HMR are non-deterministic
  relative to production.
- **Fulfilling the Google Fonts CSS URL with a multi-`@font-face` rewrite.** #191 found this
  silently falls back to system fonts — deterministic but wrong. Rewrite `index.html` and serve
  variable `@font-face` CSS instead.
- **Inventing a second marker grammar.** `[gallery:excluded #N]` / `[gallery:deferred #N]` after
  the em-dash is defined in the FEATURES preamble (#195).
- **Substituting Storybook/Chromatic** for this harness. Settled on the epic; #151 may later
  adapt the same registry.
- **Forcing a capture of a navigate-away tick.** If the UI unmounts within a frame, mark
  `excluded` under the #195 rule — do not invent a frozen frame.
