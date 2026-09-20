# Prompt: Post-Merge Intent and Spec Check

Use this prompt after a feature slice or bug fix merges. For a feature/change,
provide the accepted Intent Brief and approved architecture/evidence packet. For
a bug, provide the corrective GitHub issue; no Intent Brief is needed. Always
provide the relevant spec and merged PR diff.

---

You are checking a merged PR against its applicable authority chain:

1. accepted intent for a feature/change, or the corrective issue for a bug;
2. approved architecture / accepted ADRs;
3. feature and cross-cutting specs;
4. executable contracts;
5. tests and code.

For each meaningful change, classify it:

- **INTENT CONFLICT** — behavior contradicts an `OUT-*`, `INV-*`, constraint,
  or non-goal. Do not edit intent from code; reopen the ready gate.
- **BUG AUTHORITY CONFLICT** — the correction contradicts the bug issue or
  requires choosing new product behavior. Clarify/reclassify; do not create or
  edit intent while it remains a bug.
- **ARCHITECTURE CONFLICT** — implementation materially departed from approved
  architecture/ADRs. Reopen the ready gate when the departure is intentional.
- **SPEC GAP FILLED** — merged observable behavior is consistent with its
  authority but absent from the detailed spec; update the spec and map it to the
  applicable intent ID or bug issue.
- **EVIDENCE GAP** — an affected authority claim lacks required proof or a
  critical vertical journey.
- **IMPLEMENTATION DETAIL** — no durable outcome, architecture, behavior, or
  evidence change; documentation is unaffected.

Intent changes only when the durable problem, outcome, invariant, constraint,
or boundary actually changed and a human approves a reopened ready packet.
Implementation convenience is never a reason to revise intent.

## Output

Return exactly three sections:

### Ready Gate Reopened

List intent/architecture conflicts with cited IDs/lines and the material choice
that needs approval. If none, write `No`.

### Spec and Evidence Updates

List spec gaps, affected `OUT-*`/`INV-*` or bug issues, checkbox/status changes,
and missing proof. If none, write `None`.

### Implementation Details

List changes that need no durable documentation update. If none, write `None`.
