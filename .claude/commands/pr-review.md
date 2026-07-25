---
description: Review a PR or the current branch diff (wrapper around the pr-review skill)
argument-hint: "[PR number or URL — omit to review the current branch]"
disable-model-invocation: true
---

Use the `pr-review` skill to review $ARGUMENTS.

If no argument was given, review the current branch against `main`.

When the target is a PR, the review posts its verdict — approved or changes requested —
as a comment on that PR. Add "don't post" to the invocation to keep it in-session.

This file is a slash-command shortcut only. The review procedure itself lives in
`.claude/skills/pr-review/SKILL.md` — edit that, not this.
