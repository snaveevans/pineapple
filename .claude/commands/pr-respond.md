---
description: Address the comments, reviews, and failing CI on a PR (wrapper around the pr-respond skill)
argument-hint: "[PR number or URL — omit to use the PR for the current branch]"
disable-model-invocation: true
---

Use the `pr-respond` skill to address the feedback on $ARGUMENTS.

If no argument was given, find the open PR whose head branch is the current branch.

This file is a slash-command shortcut only. The procedure itself lives in
`.claude/skills/pr-respond/SKILL.md` — edit that, not this.
