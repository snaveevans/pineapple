> **Audience:** maintainers · AI agents · **Purpose:** how goal-driven milestone work is defined and executed · **Source of truth:** this file · **Last reviewed:** 2026-09-04

# Goals

A **goal** is a milestone-sized outcome driven end-to-end by an autonomous loop:
the maintainer writes (or revises) one goal doc, an agent decomposes it into
slices and specs, then executes slice after slice — implementing, validating,
and landing PRs — stopping only at defined escalation classes.

Goals sit **above specs**: a spec says what one feature should do; a goal says
what set of features/changes constitutes a finished milestone, and — critically —
**what deterministic evidence proves it**. Goals never duplicate spec content;
they reference specs and add the executable layer.

## Why goals exist

Specs alone don't make autonomous loops safe. The failure mode documented across
the 2025–26 agent literature is reward hacking: a long-running loop optimizes
for "look done" instead of "be done" — gutting assertions, weakening checks,
narrowing criteria. The defense is layering (see the
[epic](https://github.com/snaveevans/pineapple/issues/261)):

1. **The goal doc is hash-pinned** by the goal loop when `/goal` starts — editing
   it mid-loop stops the loop. If a criterion is genuinely wrong, block and
   restart with a revised doc.
2. **The `checks` block is the enforced stop condition.** The loop runs the
   milestone check itself (first non-comment line) on every completion claim and
   periodically. Agent-pasted output is never evidence.
3. **Per-criterion validation commands** (the rest of the checks block) are what
   `goal-executor` runs when certifying each slice — each must be verified live
   by `goal-author`: green on a clean tree, and provably failing when the
   behavior breaks.
4. **Protected paths are audited** — test files, vitest configs, stryker config,
   workflows, root `package.json`, and the goal doc itself. Changes are allowed
   in v1 but always surfaced; narrowing or deleting assertions is prohibited
   regardless of outcome.

## The goal doc

Copy [`goal.template.md`](goal.template.md) to `docs/goals/<yyyy-mm>-<name>.md`.
Section by section:

| Section             | Purpose                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Outcome             | One paragraph: the end state, for whom, and why now                                                                                                                |
| Scope               | In/out boundary; non-goals are load-bearing — they stop the loop from absorbing drift                                                                              |
| Done-when           | Acceptance criteria in EARS-style phrasing, each tagged with one slice and one validation command                                                                  |
| Delivery plan       | Slices (`S1`…), the spec each lives in, its issue, and dependencies — normally rolled up under a GitHub Milestone                                                  |
| Checks              | The ` ```checks ` fenced block: **line 1 is the enforced milestone check** (default `pnpm verify`); following lines map criteria to validation commands (comments) |
| Escalation classes  | What stops the loop vs. what the agent decides alone                                                                                                               |
| Risk & merge policy | Per-slice risk floor and the merge rule in force (human merge until ADR-0018 activates)                                                                            |
| Verification log    | Appended per slice: PR, evidence, tamper flags, rework rounds — the durable memory a cold agent or the next session resumes from                                   |

A criterion that cannot name a validation command is not done-when material —
it's either a non-goal, a spec-level detail, or not yet automatable; say so
explicitly rather than faking a check.

## Lifecycle

`draft` (being authored) → `review` (checks live-verified, awaiting maintainer
approval) → `active` (approved; the loop may run) → `complete` (all criteria
green, verification log complete). A goal doc is never edited after the loop
starts — see pinning above.

## Commands

```bash
/goal Execute docs/goals/<yyyy-mm>-<name>.md per goal-executor --max 50
```

The opencode `/goal` plugin (maintainer config, documented in
[#260](https://github.com/snaveevans/pineapple/issues/260)) provides the loop;
`goal-executor` provides the per-slice pipeline; the goal doc provides the
destination and the evidence standard.
