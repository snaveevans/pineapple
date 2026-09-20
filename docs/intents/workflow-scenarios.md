> **Audience:** maintainers · AI agents · **Purpose:** executable mental models for routing IDD work · **Source of truth:** ADR-0019 and the intent skills · **Last reviewed:** 2026-09-20

# Intent-Driven Workflow Scenarios

Use these walkthroughs to verify that workflow changes preserve the intended
gates. They describe routing, not product behavior.

| Scenario                     | Required route                                                                                                                                                                                                                | Completion evidence                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Greenfield behavior          | `intent-author` creates a draft brief plus architecture direction, conceptual evidence, scope, and high-level delivery boundaries, then waits for one explicit ready approval; the agent derives the detailed spec afterward. | Accepted intent, approved ready gate, mapped agent-owned spec, PR evidence by intent ID.                        |
| Brownfield behavior change   | Inspect existing behavior and spec, create/revise intent, and map only affected criteria.                                                                                                                                     | No unrelated legacy retagging; changed criteria and proofs map to `OUT-*`/`INV-*`.                              |
| Issue-backed bug             | Treat the issue as corrective authority, update the relevant spec even for a missed case, and begin with a failing regression test; never create or edit intent.                                                              | Regression test fails before the fix, passes after it, and maps to the issue/spec; no Intent Brief or gate.     |
| Behavior-preserving refactor | Skip intent/spec creation and preserve or add characterization coverage.                                                                                                                                                      | PR states the exception and proves observable behavior stayed fixed.                                            |
| Material conflict            | Stop when spec, test, implementation, architecture, or evidence cannot satisfy accepted intent.                                                                                                                               | Ready gate reopens with the exact conflicting ID and decision; intent is not silently edited.                   |
| Critical UI journey          | Ready evidence marks the journey critical; `test-author` names one vertical browser proof and `test-review` blocks if absent.                                                                                                 | Required zero-retry Chromium journey, retained failure trace/screenshot, green E2E status.                      |
| PR handoff                   | `pr-review` evaluates authority → architecture → spec → evidence → code; `validation-gate` names each claim and proof.                                                                                                        | For every affected ID/bug issue: claim, named proof, result, uncertainty; human verifies evidence, then merges. |

## Failure probes

The workflow is misconfigured if any of these can happen:

- `intent-executor` starts new behavior from a draft intent.
- a caller that inspected implementation authors the supposedly blind test plan
  without a fresh isolated context.
- direct intent work reaches test planning without an agent-created slice issue.
- `spec-implement` asks for routine file-level confirmation after ready approval.
- an issue-backed bug is required to create or edit an Intent Brief.
- a critical `OUT-*`/`INV-*` reaches review without mapped proof.
- a browser-critical journey is replaced only by lower-layer tests.
- a goal's feature/change slice names a spec but no accepted intent, or a bug
  slice names no corrective issue.
- green CI is treated as human evidence verification or causes an agent-authored
  PR to merge without explicit human action.
