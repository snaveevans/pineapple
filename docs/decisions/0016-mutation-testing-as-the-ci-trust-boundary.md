# Mutation Testing as the CI Trust Boundary

- Status: accepted
- Date: 2026-07-23

## Context and Problem Statement

`main` auto-merges on green CI with `required_approving_review_count: 0`. There is no human
review gate, which makes **CI the entire trust boundary**: whatever the checks accept, ships.
That arrangement is only safe if the checks can tell good output from bad.

Today they cannot. `pnpm lint` and `pnpm type-check` catch structural and typing faults, and
the test suite runs green — but nothing measures whether those tests _assert_ behavior or
merely _execute_ lines. We collect no coverage at all, and coverage would not answer the
question anyway: a suite can touch every line while asserting almost nothing. That is the
characteristic failure mode of a largely AI-authored test suite, which is what this one is.

A spike ([#86](https://github.com/snaveevans/pineapple/issues/86)) confirmed the gap is not
hypothetical: mutants that silently break real behavior — including the team-scoping on
shared-asset access — survive the current suite. The measured baseline and the full list of
surviving mutants live on that issue; this record does not reproduce them, because they are a
point-in-time snapshot and this is a durable decision.

The question this record answers is therefore not "should we test more?" but **what check,
standing at the merge boundary, can discriminate a suite that pins behavior from one that only
runs it — and how much authority should that check have over merges?**

This decision records the gate and its authority only. The live break-threshold value, the
Stryker configuration, the CI job wiring (including how the gate is kept fast), mutator tuning,
and the procedure for triaging a surviving mutant are mechanism and belong in the Testing &
Verification spec (authored next). The threshold in particular is expected to move — this
record deliberately does not pin it.

## Decision Drivers

- **CI is the only gate.** With zero required reviewers, a check that cannot discriminate
  quality is not a safety net. This dominates every other driver.
- **Assertion quality, not execution volume.** The needed evidence is "the suite fails when
  behavior changes," which line coverage structurally cannot provide.
- **Consequential logic first.** Effort should land where novel business rules live — domain
  invariants, authorization, computed read models — not on persistence plumbing whose
  behavior is the database's.
- **Fast feedback.** The hot `verify` path must stay quick. A gate that makes every PR slow
  gets routed around, and a routed-around gate is worse than none.
- **Monotonic quality.** A floor that can be quietly lowered is decorative. The guarantee has
  to be that the number only moves up.
- **Runtime fit.** Whatever we adopt must run against the source-first ESM TypeScript and
  pnpm workspace layout established by [ADR-0006](0006-deployment-platform.md) without
  introducing a build step.
- **Honest partiality.** A gate covering some layers must not be mistaken for a guarantee
  covering all of them.

## Considered Options

- **A. A blocking mutation-testing gate on the pure-logic layers.** _(chosen)_
- **B. Mutation testing, advisory only — reported but never blocking.**
- **C. Line/branch coverage thresholds.**
- **D. Require at least one human approving review.**
- **E. Status quo — lint, type-check, and the existing suite.**

Property-based testing was considered adjacent but not competing: it strengthens individual
tests, it does not measure whether the suite as a whole asserts behavior — which is the gate's
job. It could later raise the score; it is not an alternative to measuring it.

## Decision Outcome

Chosen option: **A — a blocking mutation-testing gate on the pure-logic layers.**

Mutation testing is adopted as the discrimination gate on the merge boundary, scoped to
`apps/api/src/domain/**` and `apps/api/src/application/**`. `apps/api/src/infrastructure/**`
is deliberately excluded: mutating D1 glue is slow and mostly re-asserts what the database
already guarantees. The gate is **merge-blocking** — how it is kept fast enough to block
without dragging on iteration (path-filtering to touched layers, a scheduled backstop, the job
wiring itself) is mechanism and lives in the spec.

Mutation testing for TypeScript is, in practice, **Stryker** — the one actively maintained
mutator with a Vitest runner. Adopting mutation testing is therefore adopting Stryker; the
tool was not an independently weighed choice, and the spike confirmed it runs on our
source-first ESM/pnpm setup with no build step.

The gate carries a **break threshold established by measurement, not aspiration** — set just
below the score measured at adoption, and thereafter **ratcheted upward and never lowered**.
The floor's job is to make regression impossible, not to be immediately comfortable. Starting
at the honest measured baseline means the gate is live from day one; raising it is tracked,
ongoing work ([#91](https://github.com/snaveevans/pineapple/issues/91)–[#98](https://github.com/snaveevans/pineapple/issues/98))
rather than a precondition for turning the gate on.

Blocking wins over advisory (Option B) directly on the dominating driver: with no human
reviewer, an advisory check is a notification nobody is obliged to act on, and a regression it
reports has already merged by the time anyone reads it. The spike showed the run is fast enough
that blocking imposes little friction today, so the usual objection to a blocking mutation gate
does not currently apply here.

### Revisit Trigger

Reconsider if the blocking run becomes a routine drag on iteration as the codebase grows; if
equivalent-mutant noise comes to dominate triage such that the gate is producing low-value
assertions rather than real ones; or if a human review requirement is ever introduced, since
that would mean CI is no longer the sole trust boundary and the calculus above changes.

### Layering

Mutation scope follows the layer boundaries in
[ADR-0003](0003-monorepo-layer-architecture-and-dependency-rules.md): the pure inward layers
are gated, the outward adapters are not. Domain and application code must remain unaware of
the mutation tooling — no annotations, no test-framework coupling, no production code shaped
to satisfy a mutator. If passing the gate ever requires changing production code rather than
tests, that is a defect in the gate's configuration, not a signal to change the code.

### Positive Consequences

- The merge boundary now measures whether tests pin behavior, closing the specific gap that
  `required_approving_review_count: 0` opens.
- It converts a vague worry ("are these AI-written tests any good?") into a number with a
  floor, and into located, actionable work rather than a general anxiety.
- It already surfaced real gaps in the safety net during the spike (see
  [#86](https://github.com/snaveevans/pineapple/issues/86)).
- The ratchet makes test quality monotonic: it can improve, and cannot silently decay.
- It composes with the existing checks rather than replacing them; lint and type-check keep
  their jobs.

### Negative Consequences

- Domain and application PRs get slower, and the run grows with the codebase — a real and
  permanent tax on the layers that change most.
- **Equivalent and low-value mutants create false pressure.** Some survivors are not real
  gaps — error-message copy the suite deliberately does not pin, for one. Left untuned, the
  gate pushes toward writing worthless assertions that freeze that prose, degrading the suite
  it exists to protect.
- The threshold is a number someone must own and advance. It can be gamed — by excluding
  files or lowering the floor — and nothing but discipline prevents that.
- A blocking gate can hold up an unrelated urgent fix because of a mutation regression
  elsewhere in the touched layers.
- `infrastructure/`, `api/`, and all of `apps/web` remain ungated. The guarantee is partial,
  and a green badge risks reading as broader assurance than it is.
- A high mutation score is not correctness. It proves the tests pin the behavior the code
  has, not that the behavior is the behavior we wanted — a well-asserted wrong rule still
  ships.

---

## Pros and Cons of the Options

### A. A blocking mutation-testing gate on the pure-logic layers

- Good, because it is the only option that directly measures assertion quality, which is the
  actual gap at the trust boundary.
- Good, because blocking gives the check real authority in a repo with no human reviewer.
- Good, because scoping to domain and application concentrates cost where novel logic lives.
- Good, because it runs on the source-first ESM/pnpm setup with no build step.
- Bad, because it taxes the most frequently changed layers with every run.
- Bad, because equivalent mutants require ongoing tuning to avoid incentivizing junk
  assertions.

### B. Mutation testing, advisory only — reported but never blocking

- Good, because it surfaces the same information at zero risk of blocking a merge.
- Good, because it allows the score to stabilize before anyone is held to it.
- Bad, because with no required reviewer there is no human in the loop to act on advice; the
  report arrives after the merge it should have stopped.
- Bad, because an unenforced threshold decays — the failure mode is that it is ignored until
  it is meaningless.

### C. Line/branch coverage thresholds

- Good, because it is cheap, universally understood, and trivially wired into Vitest.
- Good, because it would at least catch code with no tests exercising it at all.
- Bad, because it measures execution, not assertion — a test with zero `expect` calls raises
  coverage. It cannot detect the exact failure mode we are worried about.
- Bad, because it invites the illusion of safety: a high coverage number on this suite would
  report all-clear while an access check could be quietly broken.

### D. Require at least one human approving review

- Good, because a competent reviewer catches classes of problems no tool can, including wrong
  requirements.
- Good, because it removes the single point of failure that motivates this entire record.
- Bad, because this is a two-person team where the reviewer is frequently the author; the
  requirement would either block work or be satisfied pro forma.
- Bad, because human review is not a reliable detector of weak assertions specifically —
  reviewers read code far more carefully than they read test suites.
- Not mutually exclusive: if review is added later, this gate remains useful and its
  blocking status should be revisited.

### E. Status quo — lint, type-check, and the existing suite

- Good, because it costs nothing and keeps CI fast.
- Bad, because it is the arrangement under which checks that should catch broken
  authorization, miscomputed read models, and dropped domain-event data do not fail.
- Bad, because the risk grows with every AI-authored test added under a boundary that cannot
  evaluate them.
