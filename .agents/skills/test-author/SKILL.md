---
name: test-author
description: Author an implementation-blind, authority-mapped test plan for a feature slice or issue-backed bug. Reads accepted intent for features or the corrective issue for bugs, plus specs and ADRs; selects the lowest useful evidence layer and any required critical vertical proof. Do not use to write tests/code, review existing tests, or open a PR.
---

Resolve the target from context and proceed without routine confirmation. Do
not invent product policy. For a feature ambiguity, reopen the ready gate. For a
bug ambiguity, clarify the expected correction in the issue context; if the
answer chooses new product behavior, reclassify the work through `intent-author`.

This skill sits between `spec-author` and `spec-implement`. Accepted intent owns
feature outcomes/invariants, a bug issue owns its corrective request, specs own
detailed behavior, ADRs own significant architecture, and the GitHub issue owns
the executable test plan. There is no `docs/testing/` home.

## Hard rules

1. **Run in a fresh context and do not read implementation.** The caller must
   delegate this skill to an isolated agent/task that has not inspected the
   implementation. Pass artifact paths and issue identity only, not code
   observations or excerpts. Stay out of `packages/**`, app source,
   test files, and handlers. Existing tests/code bias the plan toward what
   already happens. For features, accepted intent and the ready packet are
   inputs; for bugs, the issue is sufficient authority. Specs and ADRs apply to
   both. If implementation is already in this context, stop and relaunch the
   plan in a fresh one.
2. **Do not write production code or test files.** `spec-implement` does
   that from the spec plus this plan.
3. **Do not invent product policy.** Unspecified behavior is a question, an
   Open Question on the spec, or an escalation — not a quiet default.
4. **Do not create a test-plan doc in the repo.** No `docs/testing/`, no
   plan pasted into `AGENTS.md`. Behavior goes in the spec; the plan goes
   on the issue.
5. **Do not reuse an error string for a different case.** A metadata message
   must not describe a non-object body. Record a distinct string in the house
   style through `spec-author`; do not add a routine approval pause.
6. **Map every required proof.** Each P0/minimum-confidence test names at least
   one affected `OUT-*`/`INV-*` for feature work, or the bug issue plus affected
   spec criterion for corrective work, and one evidence layer. Unmapped
   authority or a missing required vertical journey blocks implementation.
7. **Use the lowest useful layer.** Do not reproduce each scenario at unit,
   integration, and browser layers. Add browser E2E only when the approved
   evidence plan calls the journey critical.

## Find the target

Do not expect an argument. Resolve the issue from, in order:

1. An explicit number or URL in the user request
2. Leading digits in the branch name (`feat/5-…` → `#5`)
3. The issue linked from the spec's Delivery Plan for the slice in play
4. Return to `intent-executor`, which creates and links the slice issue
   autonomously before retrying

Then **run this** and work from the output — do not guess the spec inventory:

```bash
gh issue view <N> --json title,body,labels,comments
find docs/specs/features docs/specs/cross-cutting -name "*.md" | sort
```

Identify the feature spec the issue names (or the Delivery Plan row that points
at this issue). For a feature, read its **Related Intent** first and the approved
evidence expectations. For a bug, use the issue as authority and require the
spec's corrective update; do not require intent metadata. Then read the entire
spec, every **Related Spec**, and cited ADRs. Read `docs/specs/SPECS.md` only for
lifecycle rules.

State in one line: issue, authority (`OUT-*`/`INV-*` or bug `#N`), spec
path/criterion or slice, and whether this is a first plan or a revision of an
existing marker comment.

## 1. Restate the contract

In your own words, one sentence: what the slice does and what must never
happen. Pull from the feature intent or bug issue, the spec criteria/edge table,
and applicable Non-Goals—not from imagined implementation.

## 2. Hunt gaps

Work through [gap-checklist.md](gap-checklist.md). Catalogue every place the
spec is silent, contradictory, or weaker than the failure it would allow (for
example “500; no successful create” that still permits a leftover row).

Group the catalogue:

- **Already specified** — plan a test; do not rewrite the spec
- **Needs a product call** — reopen the ready gate for feature work; for a bug,
  clarify the issue and reclassify if the answer chooses new behavior
- **Test strategy only** — how to fake a port, what to spy. Issue comment
  only; not spec material
- **Authority/architecture/evidence conflict** — reopen `intent-author` for a
  feature; for a bug, stop when the issue/spec disagree or the correction would
  require a new product decision
- **Architectural** — hard to reverse, real alternatives. Route through the
  ready gate and `adr-author`; do not smuggle the choice into an edge-table row

Present feature product questions as a concise ready-gate delta and bug
questions as a concise issue clarification. Prefer one round of answers over
guessing “the usual REST thing.”

If the conversation already answered the calls (this session or a prior
comment), restate those answers in one block and proceed. Do not re-ask.

## 3. Split the artifact

Every fact has one home:

| Fact                                                               | Home                                       |
| ------------------------------------------------------------------ | ------------------------------------------ |
| Feature outcome/invariant/constraint                               | Intent Brief / ready gate                  |
| Bug's expected correction                                          | GitHub bug issue                           |
| Caller-visible behavior, status codes, defaults, failure leftovers | Feature spec                               |
| Why a hard-to-reverse option won                                   | ADR via `adr-author`                       |
| Authority-to-layer evidence mapping                                | Feature spec evidence plan                 |
| Prioritized tests, spies, fakes, minimum confidence set            | GitHub issue comment and later PR evidence |

Hand feature work back to `intent-author` when accepted intent/readiness is
missing or a material product call surfaced. Hand bug work back to
`issue-implement` if it needs reclassification. Hand either path to
`spec-author` when the spec is missing or needs a rewritten detailed
contract—not just sharper edges.

## 4. Update the spec

Read `docs/specs/templates/feature-spec.template.md` only if you need the
section map. Then edit the **existing** feature spec:

- Add or tighten **Edge Cases & Error States** rows. A row that only says
  “500” for a dual-write failure is incomplete — say what is left behind.
- Add exact **validation messages** to the Observable Contract. House style
  is a backticked field in a sentence, or a short period-terminated
  sentence (`Unauthorized.`, `Request body must be valid JSON.`).
- Add **acceptance criteria** only for newly decided behavior that must not
  merge without a test. Leave them unchecked (`- [ ]`). Tag them with the
  slice that owns the work (usually the issue’s existing `Sn`). Do not
  uncheck boxes you did not add.
- If you add unchecked boxes to a spec marked `active`, flip **Status** to
  `in-progress` and update the matching row in `docs/specs/SPECS.md`.
  Checked-on-a-branch is not “on `main`”; new gaps mean the slice is not
  done.
- Put unresolved calls in **Open Questions**, each a concrete either/or.
- Move future work (telemetry, repair queue) to **Out of Scope**, not fake
  ACs.
- Do **not** put test names, fake types, file paths, or constant identifiers
  (`ERROR_*`) in the spec. Those are mechanism.

If a new error string will apply to every JSON POST, add one edge-table row
on [rest-api](../../../docs/specs/features/rest-api.md) and keep the exact
wording on the operation spec that first needs it. Sibling routes reuse that
wording later; they do not invent a parallel sentence.

## 5. Post the plan on the issue

Look for an existing comment that contains `<!-- openbrain-test-author -->`.

- **None** → `gh issue comment <N> --body-file …`
- **Found** → patch that comment (`gh api repos/{owner}/{repo}/issues/comments/{id} -X PATCH`) so the issue has one live plan

Use this shape. Keep it short enough to execute; link the spec for wording
rather than pasting the whole contract.

```markdown
<!-- openbrain-test-author -->

## Test plan — <issue title>

Blind to implementation. Sources: <intent path or bug issue>, <spec path>, related specs/ADRs.

### Authority and evidence map

| Authority           | Claim | Layer       | Required proof |
| ------------------- | ----- | ----------- | -------------- |
| `OUT-1` or Bug `#N` | …     | integration | …              |

### Must never happen

- …

### Product calls recorded this round

- …

### P0 — ship blockers

One test (or a tight pair) per row. Prefix each item with its authority and
evidence layer. Highest bug-per-effort first.

1. …
2. …

### P1 — silent corruption / contract

- …

### P2 — only if cheap

- …

### Minimum confidence set

The smallest list that covers every affected authority claim and catches the
expensive failure. Usually ≤ 8. Include any required critical vertical proof.

### Out of scope for this issue

- …

### Suggested test split

Filenames / fakes for `spec-implement`. Not spec material.
```

Write tests as **observable assertions** (status, body string, store count,
embedder input, leftover row/vector). Do not prescribe implementation.

## 6. Report back

In-session, give the user:

- Authority/spec path and a bullet list of what changed (new rows, strings,
  ACs, evidence mapping, status flip)
- Link to the issue comment
- Any Open Questions still parked
- Whether the ready gate, issue classification, or an ADR changed, and why

Do not implement the handler, the error constant, or the tests unless the
user explicitly switches you to `spec-implement`.
