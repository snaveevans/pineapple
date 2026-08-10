---
description: Run the validation gate on the current branch (rebase, review, verify, risk, PR)
argument-hint: "[optional notes — e.g. draft, skip PR, risk override]"
disable-model-invocation: true
---

Use the `validation-gate` skill on the current branch.

User notes: $ARGUMENTS

If notes include a risk override or "draft", honor them. Commit and push the branch
autonomously; do not merge without explicit approval.
