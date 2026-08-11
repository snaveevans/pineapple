---
audience: all contributors
purpose: canonical verification contract — mutation gate (API) and state gallery (web)
source: this file
date: 2026-08-09
---

# Testing & Verification — Cross-Cutting Spec

**Status:** `in-progress` (gallery total and visual-diff Phase A both live; the Phase B
required-check-promotion box — [#146](https://github.com/snaveevans/pineapple/issues/146) — is the
one `[ ]` keeping this off `active`, per `SPECS.md`'s lifecycle rule)
**Owner:** engineering
**Applies To:** API logic in `apps/api/src/domain/**` and `apps/api/src/application/**` (mutation gate); renderable web states in `docs/web/FEATURES.md` / `apps/web` (state gallery + visual diff)

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

**Status:** `in-progress` (state coverage itself is total — slices 1–3 landed, deferred hatch
deleted on #193 — but the visual-diff sub-section below carries #146's Phase B box, still `[ ]`)
**Tracked by:** [#145](https://github.com/snaveevans/pineapple/issues/145), [#192](https://github.com/snaveevans/pineapple/issues/192), [#193](https://github.com/snaveevans/pineapple/issues/193) (epic [#143](https://github.com/snaveevans/pineapple/issues/143))
**Harness design source:** [#191](https://github.com/snaveevans/pineapple/issues/191) findings
**Visual diff:** [#146](https://github.com/snaveevans/pineapple/issues/146) (Phase A non-blocking)

Frontend appearance has no mutation score. The gallery is the verification contract for
`apps/web` renderable states listed in `docs/web/FEATURES.md`. The visual-diff job makes
_change_ legible on a PR without a local dev session.

### What it is

- A Playwright harness drives the **production** `vite build` output (never `vite dev`).
- The single API seam is `page.route` on `/api/**`. No product-code mocks, no Storybook.
- Each FEATURES.md state is a typed registry entry categorised `rendered` | `excluded`.
  Excluded names the issue that decided it will not be photographed. There is **no**
  `deferred` category — adding a state to FEATURES without a fixture fails CI.
- Mutation / pending states are **driven** (form submit + never-resolving write stub), not
  seeded as a cache snapshot. Content-stress strings are checked-in literals at documented
  maxima (display name and team name = 100 characters).
- Two viewports per rendered state (desktop 1280×800, mobile 390×844), `deviceScaleFactor: 1`.
- Vendored latin variable woff2 fonts (Inter + JetBrains Mono) are committed under
  `apps/web/gallery/fonts/` and served by harness-owned CSS. Google Fonts CDN is blocked.
- **No gallery PNG is ever committed.** Output lives in `apps/web/gallery/out/` (gitignored) and
  ships as a CI artifact with `retention-days: 7`. Primary protection is the gitignore entry;
  CI also fails if any path under `apps/web/gallery/**/*.png` or `apps/web/gallery/out/**` is
  tracked in git (`git ls-files`), so a force-add cannot hide in the pack.

### Coverage check (the point)

A vitest suite derives state IDs from `docs/web/FEATURES.md` and asserts:

1. Every FEATURES id is in the **hand-authored** registry as `rendered` or `excluded`.
   A new bullet with no matching entry is a red build.
2. Every registry id exists in FEATURES (renames cannot orphan a fixture).
3. A `[gallery:excluded #N]` marker must match the registry category.
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
GitHub runner image updates is not guaranteed; the visual-diff job carries a color threshold
(below) rather than asserting byte equality across sides.

### Visual diff against the base branch (#146)

**No committed baselines.** The gallery job on a pull request renders the state gallery twice in
the same runner job — once at the **merge-base** with `origin/$GITHUB_BASE_REF`, once at **HEAD** —
then pixel-diffs the pair. No baseline PNGs live in the repo; there is no "accept new baseline"
ceremony and no binary merge conflicts.

#### Diff threshold (stated number + reason)

| Lever                                     | Value                                     | Reason                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color distance (`pixelmatch` `threshold`) | **0.1**                                   | Library default YIQ distance. Filters subpixel antialiasing / PNG encoding noise that differs across Chromium patch bumps on the same runner OS image, while still flagging a solid token/color shift on a control. |
| Changed iff                               | **`numDiffPixels > 0`** after that filter | No second "allow N pixels" fudge. A missed token re-declaration can be a small solid region — exactly the failure mode this gate exists to catch (#147 / #149).                                                     |

Byte-equality is deliberately not required across the two sides: they share a runner image within
one job, but the accommodation for cross-image drift is the color threshold, not a raised pixel
budget. If a runner-image bump produces a wave of false positives, **record it as a finding** —
do not quietly raise the threshold until the build goes green.

Dimension mismatches (added/removed/resized shot) count as changed without running pixelmatch.

**Finding (2026-08-10, PR #209):** `asset-library/populated-filtered` mobile flipped between
`unchanged` and a 78px `changed` result across otherwise-identical runs on this branch (no
`apps/web/src` changes at any point). Base and head PNGs are visually indistinguishable; the diff
overlay localizes it to the truck glyph inside one asset card — sub-pixel icon/font rendering
noise, not a token or layout shift, and within `includeAA: false`'s known gap (that flag drops
antialiased edge pixels, not antialiased _glyph interior_ pixels). Recorded per the rule above
rather than silently retuning `threshold`; revisit if this or other states start flapping
regularly once Phase B is on the table.

**Recurrence (2026-08-11, PR #210):** Same state, same viewport, same 78px magnitude, on a PR
whose merge-base **is** #209's post-merge `main` and whose diff touches zero files under
`apps/web/src` — so #210's "base" render is byte-for-byte the same source #209's "head" was.
Confirms this is genuine cross-run Chromium rendering nondeterminism, not something either PR's
code caused. A same-source local reproduction attempt did _not_ flake (base and a fresh HEAD
render came back byte-identical), consistent with the original finding's "flipped between" framing
— it's intermittent, not a steady offset. The `truck` icon (`apps/web/src/design/Icon.tsx`) is an
inline SVG built from two `<circle>` wheels and short diagonal `<path>` strokes at 1.75px stroke
width — exactly the shape (curves plus thin diagonals at sub-pixel widths) most sensitive to
frame-to-frame anti-aliasing drift when its container's layout rounds by a fraction of a pixel
differently between two separate browser process launches. This is the second occurrence — per
the note above, that's the trigger to revisit once Phase B is on the table, not a threshold change
now.

#### What the job reports

- Count of changed states (screen / state / viewport triples).
- List of affected triples.
- For each change: base, head, and a highlighted diff PNG (pixelmatch red/diff overlay).
- **Phase A (this issue):** the job is **non-blocking**. Diff findings never fail the check.
  Harness crashes (cannot render) still fail so silent non-checks cannot ship.
- **Phase B:** promote the job to a required check after ~5 consecutive clean runs on real PRs.
  Same ratchet posture as the mutation floor (ADR-0016): earn the gate on measured evidence, then
  never loosen it. Tracked as a checkbox on #146, not a follow-up issue.

#### Hosting changed images (phone-reviewable PR comment)

A GitHub Actions zip is not reviewable from a phone. Changed images need public HTTPS URLs so
the PR comment can inline them as markdown.

- **Host only the delta**, not the full gallery. Typical PR: 0 uploads. A token refactor: tens of
  objects, single-digit MB. The full gallery remains a zip artifact (`retention-days: 7`) for the
  rare deep dive.
- **R2 bucket** `pineapple-visual-diff`, provisioned as IaC in `.github/workflows/deploy.yml`
  (same posture as "Ensure Queues exist" — `wrangler deploy` does not create R2 buckets). Public
  read via the managed `r2.dev` URL. Lifecycle rule expires objects after **30 days**.
- **Object keys are commit-scoped:** `pr/{number}/{head_sha}/{file}`. GitHub camo caches external
  images hard; a stable key like `pr-142/foo.png` would serve a stale image on the second push and
  look like "no change." Immutable `Cache-Control` on upload.
- **Fork PRs cannot read secrets.** Upload degrades to artifact-only; the job still posts (or
  writes to the job summary) an explanatory note and **must not fail**. A red X on a fork PR for a
  non-blocking Phase A check is exactly the flake that erodes trust in the gate.
- Same-repo PRs get a sticky PR comment (`<!-- pineapple-web-visual-diff -->`) with the summary and
  inline images, legible at phone width.

#### Running it locally

CI's dual render is the only place this used to run. `scripts/gallery-diff-local.sh`
wraps the same two CLIs so an agent (or a human) can get the merge-base-vs-HEAD
verdict **before** pushing, while still holding the context needed to fix a
regression. Interpretation guidance (how to read a changed state, the known flake,
the no-tuning rule) lives in `.claude/skills/gallery-visual-diff/SKILL.md` — this
section documents the mechanics only.

- **Ordering problem it solves:** rendering a baseline before editing needs foresight
  and goes stale on every pull/rebase; re-rendering the merge-base after every edit is
  correct but pays the ~150s render cost on every iteration. The script always derives
  the baseline from `git merge-base HEAD origin/main` in a **detached `git worktree`**
  (never `git checkout` — HEAD's working tree, branch, and `node_modules` are never
  touched) and **caches the rendered baseline keyed on the merge-base SHA**
  (`~/.cache/pineapple-gallery/<sha>/out`). First run against a given merge-base pays
  for the base render; every later iteration on that branch reuses the cache and only
  rebuilds/re-renders HEAD. The cache self-invalidates the moment the merge-base moves
  (a rebase or a `main` merge changes the SHA, which changes the cache key).
- **Relevance gate first.** Before doing anything expensive, the script diffs
  `apps/web/src` and `apps/web/gallery` against the merge-base; if neither changed, it
  prints that and exits 0 immediately rather than spending ~8-12 minutes on a PR that
  touches no rendered surface.
- **Cost:** ~8-12 minutes cold (two production builds, two ~150s renders, one
  `pnpm install` in the throwaway worktree). A cache hit skips the base-side install,
  build, and render entirely, but HEAD is always rebuilt and re-rendered from scratch —
  a warm-cache run is ~2-3 minutes, not seconds (measured: 2m40s in this PR's evidence,
  versus 5m13s cold).
- **Exit code:** 0 whenever the run completes, whether or not visual changes were
  found — a changed state is information, not a script failure. Non-zero is reserved
  for genuine failures (build, render, or worktree setup broke).
- Output (`~/.cache/pineapple-gallery/runs/latest/`) lives outside the repo, same as
  CI's artifact-only posture — no gallery PNG is ever committed, locally or in CI.
- `--refresh-base` force-discards the cached baseline and re-renders it.
- **The worktree/build/render mechanics are not duplicated between CI and local.**
  `scripts/gallery-build-render.sh` (build + `gallery:render`) and
  `scripts/gallery-render-at-ref.sh` (detached-worktree render at an arbitrary ref) are
  the shared implementation; `gallery-diff-local.sh` and the CI `gallery` job's HEAD and
  merge-base render steps all call into them rather than each spelling out the same
  bash independently.

```bash
scripts/gallery-diff-local.sh
scripts/gallery-diff-local.sh --refresh-base
```

#### Acceptance criteria (#146)

- [x] A PR with no visual change reports zero changed regions and uploads no images. `S1`
- [x] A PR with an intended visual change reports exactly the affected states, with highlighted diff images. `S1`
- [x] The summary comment renders the changed images **inline**, legibly, on a phone. `S1`
      Verified live on PR #209 (sha `290ccd6`): `pr/209/290ccd6.../{base,head,diff}/asset-library__populated-filtered__mobile.png`
      uploaded to R2 and inlined via GitHub's camo cache (`HTTP 200`, `x-cache: HIT`, real 390×956
      PNGs). Two bugs found and fixed en route, both in CI plumbing only (no product code touched):
      (1) `upload-visual-diff-r2.sh` passed a relative `--file` path to
      `pnpm --filter @snaveevans/pineapple-web exec wrangler`, which runs with cwd set to `apps/web/`
      — every object put 404'd and silently fell back to artifact-only via `continue-on-error`. R2
      bucket/lifecycle/dev-url provisioning was never the problem. (2) `diff.ts`'s CLI-entry guard
      only checked `process.env.VITEST`, so importing `buildCommentMarkdown` from
      `report-comment.ts` re-ran `diff.ts`'s own `main()` against the wrong argv (no `--base`),
      crashing the process with `exit(1)` before the comment could be written. Scoped the guard to
      `import.meta.url` matching the invoked script instead.
- [x] No committed baseline PNGs are introduced, and no PNG is committed at all. `S1`
- [x] Object keys are commit-scoped; pushing twice to the same PR shows the new images, not camo's cache. `S1`
- [x] The R2 bucket is provisioned as IaC, not by hand in the dashboard. `S1`
- [x] A lifecycle rule expires objects (30 days). `S1`
- [x] A fork PR degrades to artifact-only with an explanatory note, and does not fail. `S1`
- [x] The pixel threshold is a stated number with a stated reason (table above). `S1`
- [x] Phase A is non-blocking on merge. `S1`
- [ ] Phase B: promoted to a required check after ~5 consecutive clean runs. `S1` (checkbox only — flip when evidence exists)

#### Delivery plan

| Slice | Scope                                                                              | Issue | Depends on       |
| ----- | ---------------------------------------------------------------------------------- | ----- | ---------------- |
| `S1`  | Dual render, pixel diff, R2 delta hosting, sticky PR comment, Phase A non-blocking | #146  | #145, #192, #193 |

### Commands

```bash
pnpm --filter @snaveevans/pineapple-web build
pnpm --filter @snaveevans/pineapple-web gallery:render -- --out apps/web/gallery/out
pnpm --filter @snaveevans/pineapple-web gallery:diff -- \
  --base apps/web/gallery/out-base \
  --head apps/web/gallery/out-head \
  --out apps/web/gallery/out-diff
pnpm --filter @snaveevans/pineapple-web test   # includes gallery coverage check
```

`--out` on `gallery:render` is required so one job can render merge-base and HEAD into two
directories. `gallery:diff` writes `summary.json` and highlighted diff PNGs; the PR comment body
is generated separately by `report-comment.ts` from that summary (never pre-written by the diff
step itself — CI's fallback-detection depends on `comment.md` only existing once that later step
succeeds).

### Feature integration contract

Every change that adds or renames a renderable state in `docs/web/FEATURES.md` must:

- Land a matching registry entry (`rendered`, or `excluded` with an issue number and evidence).
- Not commit gallery output.
- Not edit product code solely to make a transient state photographable — open an issue instead
  (precedent: #195 for 401 redirect states).

### Decisions on edge-case states (#192 / #199)

1. **States that paint nothing (App Search `Closed`).** Keep them on a **distinct host** so the
   resting search control is not a byte-identical twin of another FEATURES id. `Closed` is the
   chrome affordance (entry point visible, overlay absent) — photograph it on a populated assets
   page, not on empty dashboard.
2. **OAuth-redirect / navigate-away flows (Sign In, Onboarding complete).** Photograph only
   stable frames. Sign In `idle`, `in-flight` (social POST held pending so the page never leaves
   the origin), and `error` (`?error=google`) are stable and rendered. Onboarding incomplete forms
   are stable and rendered. Navigate-away transitions remain non-enumerable — do not invent a
   frozen frame (#195 rule).
3. **Unreachable or product-identical shell states are `excluded`, not faked.** Authenticated
   App Shell profile `loading`/`error` never mount `HFTopBar` on cold load (OnboardingGuard shares
   `userProfileQueryKey`). Notifications badge `loading`/`error` are pixel-identical to
   zero-unread. Shell `mobile` double-counts the dual-viewport harness on `desktop`. All five are
   `[gallery:excluded #199]`. Onboarding screen load `error` still renders as the same spinner as
   `loading` (product has no distinct error UI) and stays `rendered` so the id is honest about
   what paints.
4. **No silent byte-identical pairs across different FEATURES ids.** Host stubs must make each
   rendered id’s photograph distinct (different route body and/or chrome signal). An ad-hoc pair
   that is byte-identical is how silent non-checks ship.
5. **Product-identical mutation/notice frames are `excluded` (#201).** Notifications
   `mutation-pending-mark-one-read` has no pending chrome (`isPending` unread). Profile
   `notice-saved` uses the same contact-email subtext as `contact-email-verified`. Both are
   `[gallery:excluded #201]` — do not fake a distinct frame.

### Anti-patterns

- **Committing gallery PNGs or baselines.** They bloat the pack forever and are unreclaimable
  without history rewrite. Artifacts only; visual diff is always merge-base vs HEAD in one job
  (#146) — never a committed baseline set.
- **Stable R2 object keys across pushes.** Camo caches hard; keys must include the head SHA (or a
  content hash). A key like `pr-142/foo.png` will show a stale image on the second push.
- **Driving the gallery through `vite dev`.** Dev StrictMode and HMR are non-deterministic
  relative to production.
- **Fulfilling the Google Fonts CSS URL with a multi-`@font-face` rewrite.** #191 found this
  silently falls back to system fonts — deterministic but wrong. Rewrite `index.html` and serve
  variable `@font-face` CSS instead.
- **Inventing a second marker grammar.** `[gallery:excluded #N]` after the em-dash is defined in
  the FEATURES preamble (#195). There is no `deferred` marker — the hatch was deleted on #193.
- **Stubbing a mutation `pending` state from a seeded cache.** Pending means a write is in
  flight: hold the mutation response and drive the submit via `interact`.
- **Substituting Storybook/Chromatic** for this harness. Settled on the epic; #151 may later
  adapt the same registry.
- **Forcing a capture of a navigate-away tick.** If the UI unmounts within a frame, mark
  `excluded` under the #195 rule — do not invent a frozen frame.
