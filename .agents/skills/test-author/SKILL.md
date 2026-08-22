---
name: test-author
description: Author an implementation-blind test plan for an Open Brain issue or spec slice — hunt spec gaps, record caller-visible corner cases in the feature spec, and post the prioritized plan as a GitHub issue comment. Use whenever the user asks for a test plan, testing criteria, coverage gaps, what to test, or to test-author an issue, including before spec-implement and after a spec lands. Do not use to write tests or production code (spec-implement), to judge whether existing tests pin the plan (test-review), or to open a PR (validation-gate).
---

Work conversationally. Confirm the target issue and any unresolved product
calls before writing. Do not invent product policy, and do not generate the
spec delta or issue comment until the gaps that need a human ruling are
either answered or parked as Open Questions.

This skill sits **between** `spec-author` and `spec-implement`. Specs own
behavior. The GitHub issue owns the test plan. ADRs own hard-to-reverse
choices. There is no `docs/testing/` home — ADR-0002 forbids a third typed
doc.

## Hard rules

1. **Do not read implementation.** Stay out of `packages/**`, test files,
   and handler source. Existing tests and code bias the plan toward what
   already happens. The spec and the issue are the inputs. If you already
   saw code earlier in the conversation, do not go back for more, and do
   not tailor the plan to it.
2. **Do not write production code or test files.** `spec-implement` does
   that from the spec plus this plan.
3. **Do not invent product policy.** Unspecified behavior is a question, an
   Open Question on the spec, or an escalation — not a quiet default.
4. **Do not create a test-plan doc in the repo.** No `docs/testing/`, no
   plan pasted into `AGENTS.md`. Behavior goes in the spec; the plan goes
   on the issue.
5. **Do not reuse an error string for a different case.** A metadata
   message must not describe a non-object body. Propose a new string in the
   house style and confirm it.

## Find the target

Do not expect an argument. Resolve the issue from, in order:

1. An explicit number or URL in the user request
2. Leading digits in the branch name (`feat/5-…` → `#5`)
3. The issue linked from the spec's Delivery Plan for the slice in play
4. Ask if still ambiguous

Then **run this** and work from the output — do not guess the spec inventory:

```bash
gh issue view <N> --json title,body,labels,comments
find docs/specs/features docs/specs/cross-cutting -name "*.md" | sort
```

Identify the feature spec the issue names (or the Delivery Plan row that
points at this issue). Read **that spec**, every **Related Spec** it lists,
and any ADR it cites. Read `docs/specs/SPECS.md` only if you need the
status / checkbox rules.

State in one line: issue, spec path, and whether this is a first plan or a
revision of an existing `<!-- openbrain-test-author -->` comment.

## 1. Restate the contract

In your own words, one sentence: what the slice does, and what must never
happen. Pull “must never happen” from the spec’s acceptance criteria, edge
table, and Out of Scope — not from how you imagine the code works.

## 2. Hunt gaps

Work through [gap-checklist.md](gap-checklist.md). Catalogue every place the
spec is silent, contradictory, or weaker than the failure it would allow (for
example “500; no successful create” that still permits a leftover row).

Group the catalogue:

- **Already specified** — plan a test; do not rewrite the spec
- **Needs a product call** — ask. Do not proceed to write until each is
  answered or parked
- **Test strategy only** — how to fake a port, what to spy. Issue comment
  only; not spec material
- **Architectural** — hard to reverse, real alternatives. Offer
  `adr-author`; do not smuggle the choice into an edge-table row

Ask the product questions in a tight list. Prefer one round of answers over
guessing “the usual REST thing.”

If the conversation already answered the calls (this session or a prior
comment), restate those answers in one block and proceed. Do not re-ask.

## 3. Split the artifact

Every fact has one home:

| Fact                                                                                   | Home                                                                                                        |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Caller-visible behavior, validation strings, status codes, defaults, failure leftovers | Feature spec (edge table, Observable Contract, new AC boxes only when the behavior must be gated on `main`) |
| Why a hard-to-reverse option won                                                       | ADR via `adr-author`, only when the user wants that lock                                                    |
| Prioritized tests, spies, fakes, minimum confidence set                                | GitHub issue comment (and later the implementing PR’s Test plan, which links here)                          |

Hand back to `spec-author` instead of editing when the spec is missing,
still `draft`/`wip`, or needs new personas / a rewritten contract — not just
sharper edges.

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

Blind to implementation. Source: <spec path> (plus related specs / ADRs named there).

### Must never happen

- …

### Product calls recorded this round

- …

### P0 — ship blockers

One test (or a tight pair) per row. Highest bug-per-effort first.

1. …
2. …

### P1 — silent corruption / contract

- …

### P2 — only if cheap

- …

### Minimum confidence set

The smallest list that would still catch the expensive failure. Usually ≤ 8.

### Out of scope for this issue

- …

### Suggested test split

Filenames / fakes for `spec-implement`. Not spec material.
```

Write tests as **observable assertions** (status, body string, store count,
embedder input, leftover row/vector). Do not prescribe implementation.

## 6. Report back

In-session, give the user:

- Spec path and a bullet list of what changed (new rows, new strings, new
  ACs, status flip)
- Link to the issue comment
- Any Open Questions still parked
- Whether an ADR was offered or skipped, and why

Do not implement the handler, the error constant, or the tests unless the
user explicitly switches you to `spec-implement`.
