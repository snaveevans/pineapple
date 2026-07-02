You are working in `/Users/tyler/workspace/pineapple` on the current branch. Read `AGENTS.md`, `PLAN.md`, and `TASKS.md` before making changes.

This work must incorporate the local `spec-implement` skill. If the skill is available in your environment, invoke it. In all cases, read and follow these files directly before editing:

- `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/SKILL.md`
- `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/layer-checklist.md`

## How to run this with `/goal`

This file is the working method for a `/goal` session. Set the goal to the
completion condition below; `/goal` then keeps starting new turns on its own,
completing one task per turn, until a fast evaluator model confirms the
condition is met. Recommended condition:

```text
/goal Follow GOAL_PROMPT.md. Each turn, complete exactly one unchecked `- [ ]`
task in TASKS.md: implement code + tests + generated artifacts + docs, run the
required validation, flip only that task's checkbox to `- [x]`, and commit.
The goal is met only when the latest turn shows `grep -c '^- \[ \]' TASKS.md`
printing `0` AND the PLAN.md Final Completion Gate (openapi:generate + `git diff
--exit-code docs/reference/openapi.json`, lint, type-check, tests) has passed
with its output shown in this conversation. Stop and report instead if you hit a
hard blocker as described in GOAL_PROMPT.md, or after 40 turns.
```

Because the evaluator only judges what you surface in the conversation — it does
not run commands or read files itself — you must print the proof it checks: the
`grep -c '^- \[ \]' TASKS.md` count each turn, and the Final Completion Gate
output on the last turn. To stop before the condition holds, run `/goal clear`.

## Goal execution model

`/goal` runs this session toward the completion condition, not one task and out:

- Each turn completes and commits exactly one task, then returns. The `/goal`
  evaluator inspects the turn and, if the condition is not yet met, automatically
  starts the next turn. You do not schedule the next turn, wait on a wall-clock
  interval, or idle-poll — turn continuation is handled for you.
- One task per turn keeps commits small and reviewable. Never batch tasks.
- The session ends when the evaluator confirms the completion condition (all
  `- [ ]` tasks are gone and the Final Completion Gate has passed), or when you
  hit a hard blocker you cannot resolve without the user and stop for review.

## Per-turn procedure

Perform exactly one implementation task per turn:

1. Find the first unchecked task in `TASKS.md` whose line starts with `- [ ]`.
   If there are none, go to "When the task list is empty".
2. Treat that task as the entire scope for this turn. Do not start the next unchecked task.
3. Read the source specs and ADRs named in `PLAN.md` that are relevant to the task.
4. Inspect the existing code before editing. Follow the repo's layer rules, Cloudflare Workers constraints, and existing patterns.
5. Implement all code, tests, generated artifacts, and documentation required by that one task.
6. Run the validation commands required by `PLAN.md` and by the task. If API route/schema files changed, regenerate OpenAPI. If migrations changed, apply them locally.
7. If validation fails, fix the task until validation passes. Do not mark the task complete while known failures remain.
8. Change only that task's checkbox in `TASKS.md` from `- [ ]` to `- [x]`.
9. Review `git diff` to ensure the changes are scoped to the task and do not revert unrelated user work.
10. Stage the files changed for the task.
11. Commit with a concise message describing the completed task.
12. After the commit, report the commit hash, the validation commands run, any residual risk for this task, and the current `grep -c '^- \[ \]' TASKS.md` count in one or two lines. Then end the turn — the `/goal` evaluator will start the next turn for the next unchecked task unless the completion condition is met.

## When the task list is empty

When step 1 finds no `- [ ]` tasks remaining, the implementation work is done:

1. Run the Final Completion Gate from `PLAN.md` and show its output in the conversation so the evaluator can confirm it passed.
2. Report overall status: which tasks were completed this run, the gate result, and any residual risk or follow-ups.
3. The completion condition is now satisfied; the goal clears itself. Do not start another task.

## Stopping early

Stop before the list is empty only when you hit a blocker you cannot resolve without the user: repeated validation failures you cannot fix, a missing decision, or destructive/ambiguous work. In that case, report the blocker clearly and stop the turn so the user can intervene (they can `/goal clear` to end the goal). Do not silently skip a task to keep going.

Rules:

- Do not batch multiple `TASKS.md` items into one turn.
- Do not skip ahead. If the first unchecked task is already complete in the codebase, validate it, check it off, commit the checkbox update, and continue with the next task.
- Do not implement parked archive/unarchive work from `docs/specs/backlog/archive-asset.md`.
- Do not implement web UX yet. The designer has not produced the web designs. Do not add or modify profile contact-email UI, a `/verify-email` page, notifications inbox/bell behavior, `apps/web/**`, or `docs/web/FEATURES.md` unless a future task explicitly updates this plan after design is available.
- Do not hand-edit `docs/reference/openapi.json`; generate it.
- Do not put PII into Analytics Engine telemetry.
- Do not use Node-only APIs or `process.env` in `apps/api/src/**`.
- Do not revert changes you did not make.
- If the task requires current Cloudflare Email Sending, Queues, or Wrangler behavior, load the relevant local skill/docs or fetch current official Cloudflare documentation before editing.
