> **Audience:** maintainers · AI agents · **Purpose:** blank starting point for a goal doc · **Source of truth:** this file · **Last reviewed:** 2026-09-04

# Goal: <kebab-name>

**Status:** `draft` <!-- draft → review → active → complete -->
**Milestone:** <!-- GitHub Milestone number/URL, created by goal-author -->
**Created:** <!-- yyyy-mm-dd -->
**Last reviewed:** <!-- yyyy-mm-dd -->

## Outcome

<!-- One paragraph. The end state, for whom, and why now. If it takes more than
     one paragraph, it is probably two goals. -->

## Scope

**In:**

<!-- Concrete capabilities/changes included. -->

**Out (non-goals):**

<!-- Explicit exclusions. These are load-bearing: they are what stops the loop
     from absorbing scope drift mid-run. -->

## Done-when

<!-- EARS-style criteria: observable, testable, unambiguous. Each criterion
     carries exactly one slice tag and one validation command (mirrored in the
     checks block below). A criterion that cannot name a validation command
     doesn't belong here. -->

- [ ] When <trigger>, the system shall <observable behavior>. — validation: `<command>` `S1`
- [ ] <criterion> — validation: `<command>` `S2`

## Delivery plan

<!-- Slices map to specs' Delivery Plans where features exist; goal-author
     creates the Milestone and one issue per slice. -->

| Slice | Scope | Spec                     | Issue | Depends on |
| ----- | ----- | ------------------------ | ----- | ---------- |
| `S1`  |       | docs/specs/features/….md | #     | —          |
| `S2`  |       | docs/specs/features/….md | #     | `S1`       |

## Checks

<!-- The goal loop parses this block: LINE 1 is the enforced milestone check —
     the plugin runs it on every completion claim and every 5th iteration.
     Remaining lines map criteria to validation commands (goal-executor runs
     them when certifying a slice). Comments are conventions, not enforcement. -->

```checks
pnpm verify
# S1: <criterion> → <command>
# S2: <criterion> → <command>
```

## Escalation classes

<!-- What stops the loop (agent must emit [[GOAL_BLOCKED]] with DECISION NEEDED
     + options) vs. what the agent decides alone. Defaults below; edit per goal. -->

**Stops the loop:**

- Product choice not derivable from this doc or linked specs
- Unresolvable merge conflict needing a product decision
- H/C-risk change (per validation-gate's hybrid risk score)
- A red gate unfixable in ~3 rounds
- Any tamper flag the agent cannot justify in writing

**Agent decides alone:**

- Implementation details within a slice's scope
- Mechanical conflict resolution
- L/M-risk merge per the policy in force
- Test _additions_ (never narrowing/deleting existing assertions)

## Protected paths

<!-- Audited every iteration; changes surfaced, each must be justified in the
     PR description. Built-in defaults (do not remove): all `**/*.test.ts(x)`,
     vitest configs, `apps/api/stryker.conf.json`, `.github/workflows/**`, root
     `package.json`, and this goal doc (hash-pinned — edits stop the loop). -->

**Goal-specific extras:** <!-- none, or paths -->

## Risk & merge policy

<!-- Default: validation-gate's risk table; human merge on every PR until
     ADR-0018 activates, then L auto / M batched / H-C human. State the policy
     in force at authoring time so a cold agent doesn't guess. -->

- Policy in force: human merge on every PR (ADR-0018 pending)
- Known H/C-risk slices: <!-- list, or "none expected" -->

## Verification log

<!-- goal-executor appends one row per landed slice. This is the durable memory
     a cold agent resumes from and the batch review digest reads from. -->

| Date | Slice | PR  | Evidence | Tamper flags | Rework rounds | Notes |
| ---- | ----- | --- | -------- | ------------ | ------------- | ----- |
