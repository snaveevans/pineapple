# Risk-tiered autonomous merge policy

- Status: proposed
- Date: 2026-09-04

## Context and Problem Statement

The repository's branch protection already permits autonomous merges: `main` auto-merges
on green CI with `required_approving_review_count: 0`. What actually withholds merges is
agent-side policy — `validation-gate` and `issue-implement` both hard-stop at "do not
merge without explicit user approval." The maintainer is the merge bottleneck for every
PR, including trivial docs changes.

Goal-driven development (epic [#261](https://github.com/snaveevans/pineapple/issues/261))
needs the opposite: a milestone of slices delivered with the human reviewing by exception,
not by keystroke. But autonomy without back-pressure is how reward-hacking agents land
regressions — published analyses of SWE-bench agents show them silently weakening tests
to pass. The deterministic back-pressure this repo already has or is building — CI verify
with generated-artifact drift checks, mutation testing as the CI trust boundary
([ADR-0016](0016-mutation-testing-as-the-ci-trust-boundary.md)), D1 integration tests
(#120), and the post-deploy smoke check (#89) — is what makes a bounded amount of
autonomy defensible.

The decision: **what may reach production without a human keystroke, and on what
evidence.**

## Decision Drivers

- **Goal-driven autonomy** — per-PR merge interrupts break the autonomous loop; a
  policy that still requires a click per PR delivers none of the milestone-scale benefit.
- **Blast-radius-proportional scrutiny** — a docs edit and a migration should not
  demand the same human attention; scarce review time must concentrate where damage is
  hardest to undo.
- **Reward-hacking resistance** — an agent optimizing for green checks can weaken tests
  or contracts; what auto-merges must pass gates the agent cannot quietly subvert.
- **Auditability** — every autonomous merge must leave evidence (risk score, adversarial
  review result) so post-hoc human sampling is cheap and findings are actionable.
- **Detectability** — production deploys are verified by the post-deploy smoke check and
  reversible per the rollback runbook, so a bad low-risk merge is observable at deploy time.
- **One-person team** — the human is the scarcest resource in the system.

## Considered Options

- **Option A — Status quo (implicit human-merge):** keep the current hard-stop; every
  PR waits for a click.
- **Option B — Full auto-merge on green CI:** any green PR merges, no tiering, no
  adversarial review requirement.
- **Option C — Risk-tiered autonomous merge:** merge authority follows the PR's risk
  score, with different evidence required per tier and an immutable high-risk floor.

## Decision Outcome

Chosen option: **Option C — risk-tiered autonomous merge**, because it is the only
option that reconciles milestone-scale autonomous delivery with blast-radius-proportional
scrutiny. Option A caps delivery at human typing speed and wastes review attention on
trivial diffs. Option B removes the human from exactly the merges that can end careers of
this project (migrations, auth, contracts) and offers reward-hacking agents a single
uniform gate to game.

The policy, once **activated** (see Activation gate below):

| Risk          | Merge authority             | Required evidence                                                                                                        |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **L**         | Agent merges autonomously   | Green CI **and** clean fresh-context adversarial review (`pr-review` with no unresolved high-confidence findings)        |
| **M**         | Agent merges autonomously   | Same as L, **plus** the PR lands in the next-day batch digest the human samples; findings trigger `pr-respond` or revert |
| **H** / **C** | Human merges, no exceptions | The validation-gate human budget for that level applies in full                                                          |

- Risk scoring and its override rules stay owned by `validation-gate` (path-glob
  baseline, semantic elevations, "never override below C") — this ADR only consumes the
  resulting score.
- **Human-only actions, always, regardless of risk:** merging H/C PRs, accepting an ADR,
  applying the `breaking-api` / `large-diff` labels, and any secret or credential
  operation.
- Every autonomous merge records the tier, the review outcome, and the CI run in the PR
  body — the merge itself is part of the audit trail.

### Activation gate

The policy does **not** take effect until **all** of the following hold:

1. The deterministic back-pressure is complete: mutation gate extended to `api/**`
   (#126), D1 integration tests (#120), post-deploy smoke check (#89 — landed).
2. Two consecutive weeks of green telemetry under the current human-merge regime:
   rework rounds, review findings, and escaped defects all trending stable or down.

Until activation, the human continues to merge (today's behavior). Activation is
declared by the human, not the agent — flipping this ADR to `accepted` and announcing
the digest convention are the same act.

### Positive Consequences

- Milestone-scale autonomous delivery becomes possible without lowering the bar for
  dangerous changes; H/C scrutiny is untouched.
- Human attention concentrates on the diffs that need judgment, sampled via the digest
  rather than demanded per PR.
- The policy is explicit and auditable where today it is implicit ("the human happens
  to click"), so it can be reasoned about, tightened, or rolled back deliberately.
- Builds directly on the trust boundary of [ADR-0016](0016-mutation-testing-as-the-ci-trust-boundary.md):
  autonomous merges inherit mutation-tested test suites, not agent-editable ones alone.

### Negative Consequences

- Bad L/M merges can reach production without human eyes. Mitigated — post-deploy
  smoke, rollback runbook, digest sampling — but not eliminated; fast revert discipline
  becomes load-bearing.
- Digest findings arrive **after** merge; the human is reviewing to catch patterns, not
  to prevent individual regressions.
- Adversarial review is LLM-based and non-deterministic; it supplements the deterministic
  gates, never substitutes for them.
- The two-week telemetry gate delays autonomy; urgency does not waive it.

---

## Pros and Cons of the Options

### Option A — Status quo

- ✅ Good, because zero new risk; the human sees every diff before it lands.
- ❌ Bad, because it contradicts the goal-driven operating model — the loop still
  interrupts per PR, and the human's attention does not scale with slice count.
- ❌ Bad, because the current per-PR review is already shallow-by-necessity (one person,
  many PRs) — uniform attention is an illusion.

### Option B — Full auto-merge on green CI

- ✅ Good, because maximum delivery speed and no tier bookkeeping.
- ❌ Bad, because green CI is exactly the thing a reward-hacking agent controls; with no
  adversarial review and no risk floor, a gutted test suite merges as easily as a real fix.
- ❌ Bad, because it treats a typo fix and a schema migration identically.

### Option C — Risk-tiered autonomous merge (chosen)

- ✅ Good, because autonomy is granted exactly where evidence is strongest and blast
  radius smallest, and withheld exactly where it is not.
- ✅ Good, because every tier's evidence requirement is checkable after the fact.
- ❌ Bad, because two review regimes now exist (autonomous and human), and the digest
  convention must actually be worked or M-tier findings rot unread.
- ❌ Bad, because the agent both scores risk and merges at L/M — the score is
  agent-asserted, so the semantic-elevation rules and the C floor must stay sharp.
