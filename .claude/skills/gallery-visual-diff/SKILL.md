---
name: gallery-visual-diff
description: Run the web state gallery's visual diff locally against the merge-base before pushing a frontend change. Use after editing anything that can alter the rendered web app — CSS, a stylesheet, a design token, a component under apps/web/src, layout, or a UX/visual refactor. Do NOT use for test-only edits, docs-only changes, or apps/api work — nothing in this skill applies there.
---

Prove a frontend change is visually clean **while you still have context**, instead of
pushing and reading a CI comment cold. This is the same merge-base-vs-HEAD pixel diff
CI runs (`docs/specs/cross-cutting/testing.md`, "Visual diff against the base branch
(#146)"), wrapped for local use.

**Say the cost up front.** A cold run is ~8-12 minutes (two production builds, two
~150s Playwright renders, one `pnpm install` in a throwaway worktree). Every later run
against the same merge-base reuses the cached baseline and only rebuilds/re-renders
HEAD — seconds, not minutes. Decide with the user (or just note it) whether to run now
or after you finish iterating on the change; don't block a fast edit-loop on a cold run.

## Run it

```bash
scripts/gallery-diff-local.sh              # normal run
scripts/gallery-diff-local.sh --refresh-base   # force-discard the cached baseline
```

The script does the mechanics — relevance gate, merge-base worktree, caching, render,
diff. Don't re-derive that logic inline; read `scripts/gallery-diff-local.sh` if you
need to know exactly what it does. This skill is about **reading the result**.

If it prints "No changes under apps/web/src/\*\* or apps/web/gallery/\*\* since
merge-base — visual diff skipped" and exits 0, there's nothing to diff — the edit
didn't touch a rendered surface. That's a normal, correct outcome, not a skip you
need to force past.

## Reading the result

**Zero changed states** → the change is visually clean. Say so plainly in the PR body
(e.g. "Local gallery diff: 0 changed states"). This is a real, checkable claim — the
script just proved it, not just claimed it.

**Any changed states** → classify **every one** as INTENDED or REGRESSION before
writing the PR body. Don't just paste the count.

- For a change that's supposed to alter appearance (new component, restyle), a
  changed state that matches the intended area is INTENDED — name it and why.
- For a **behavior-preserving refactor** (the #147 / #149 pattern — renaming,
  extracting, reorganizing without an intended visual change), treat every changed
  state as a REGRESSION until you've looked at the diff PNG and can explain why it's
  actually fine. "The refactor shouldn't have touched pixels" is not proof that it
  didn't — open `<diff dir>/diff/<file>.png` and look.
- The PR body must name and justify each changed triple, not just report the total.

The script prints the diff directory path and the changed screen/state/viewport
triples; `base/`, `head/`, and `diff/` subfolders hold the actual PNGs plus
`summary.json`.

## Known flake — do not chase it

`asset-library/populated-filtered` at the **mobile** viewport has flapped between
`unchanged` and a ~78px `changed` result across otherwise-identical runs, with no
`apps/web/src` changes in play (recorded in `testing.md`, PR #209 — sub-pixel glyph
interior rendering noise inside one asset card's icon, not a token or layout shift).

If that state is the **only** one that shows a small change, **re-run before
believing it**. Do not spend time investigating it as a real regression, and do not
"fix" it by touching product code or the harness.

## Hard rule: never tune the threshold

If you see what looks like a false positive (a change that shouldn't be there,
happening consistently — not the known flake above), **record it as a finding** in
`docs/specs/cross-cutting/testing.md` the same way PR #209's finding is recorded.
**Never raise the `pixelmatch` threshold to make a diff go green.** "Make the diff
pass" is not the goal here — "know whether the change is visually clean" is. Loosening
the threshold answers a different, wrong question.

## This is not a CI gate — yet

Phase A of the visual diff is **non-blocking** in CI today: diff findings never fail
the check (Phase B — promotion to required — is still an open checkbox on #146). So a
clean local run doesn't make CI red-or-green either way. The value of this skill is
purely **getting the answer while you still have the context to fix it**, rather than
finding out from a PR comment after the fact. Don't imply in a PR body that a clean
local run is a gate passing — say what it actually is: local evidence the author
checked and the result was clean (or that the changes were classified as intended).
