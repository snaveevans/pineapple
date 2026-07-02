You are working in `/Users/tyler/workspace/pineapple` on the current branch. Read `AGENTS.md`, `PLAN.md`, and `TASKS.md` before making changes.

This loop must incorporate the local `spec-implement` skill. If the skill is available in your environment, invoke it. In all cases, read and follow these files directly before editing:

- `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/SKILL.md`
- `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/layer-checklist.md`

## Loop execution model

You are running under the `/loop` skill in self-paced (dynamic) mode. The loop
does **not** end after one task. Each iteration completes exactly one task, then
the loop continues on its own to the next task until `TASKS.md` has no `- [ ]`
items left.

- One task per iteration keeps commits small and reviewable. Never batch tasks.
- After you finish and commit a task, do **not** treat that as the end of the
  work. Continue the loop so the next iteration picks up the next unchecked task.
- Self-pace: keep iterations back-to-back. There is no wall-clock interval to
  wait for — the only reason to schedule a longer wait is if you are genuinely
  blocked on external work (e.g. a long-running command). Do not idle-poll.
- The loop terminates only when there are no unchecked `- [ ]` tasks remaining
  (see "When the task list is empty" below), or when you hit a hard blocker you
  cannot resolve without the user.

## Per-iteration procedure

Perform exactly one implementation loop iteration:

1. Find the first unchecked task in `TASKS.md` whose line starts with `- [ ]`.
   If there are none, go to "When the task list is empty".
2. Treat that task as the entire scope for this iteration. Do not start the next unchecked task.
3. Read the source specs and ADRs named in `PLAN.md` that are relevant to the task.
4. Inspect the existing code before editing. Follow the repo's layer rules, Cloudflare Workers constraints, and existing patterns.
5. Implement all code, tests, generated artifacts, and documentation required by that one task.
6. Run the validation commands required by `PLAN.md` and by the task. If API route/schema files changed, regenerate OpenAPI. If migrations changed, apply them locally.
7. If validation fails, fix the task until validation passes. Do not mark the task complete while known failures remain.
8. Change only that task's checkbox in `TASKS.md` from `- [ ]` to `- [x]`.
9. Review `git diff` to ensure the changes are scoped to the task and do not revert unrelated user work.
10. Stage the files changed for the task.
11. Commit with a concise message describing the completed task. End the commit message with this trailer:

    ```text
    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
    ```

12. After the commit, report the commit hash, validation commands run, and any residual risk for this task in one or two lines. Then **continue the loop to the next iteration** — return to step 1 for the next unchecked task. Do not end the loop here.

## When the task list is empty

When step 1 finds no `- [ ]` tasks remaining, the implementation work is done:

1. Run the Final Completion Gate from `PLAN.md`.
2. Report overall status: which tasks were completed this run, the gate result, and any residual risk or follow-ups.
3. End the loop (do not schedule another iteration).

## Stopping early

Stop the loop before the list is empty only when you hit a blocker you cannot resolve without the user: repeated validation failures you cannot fix, a missing decision, or destructive/ambiguous work. In that case, report the blocker clearly and end the loop so the user can intervene. Do not silently skip a task to keep going.

Rules:

- Do not batch multiple `TASKS.md` items into one iteration.
- Do not skip ahead. If the first unchecked task is already complete in the codebase, validate it, check it off, commit the checkbox update, and continue to the next iteration.
- Do not implement parked archive/unarchive work from `docs/specs/backlog/archive-asset.md`.
- Do not implement web UX yet. The designer has not produced the web designs. Do not add or modify profile contact-email UI, a `/verify-email` page, notifications inbox/bell behavior, `apps/web/**`, or `docs/web/FEATURES.md` unless a future task explicitly updates this plan after design is available.
- Do not hand-edit `docs/reference/openapi.json`; generate it.
- Do not put PII into Analytics Engine telemetry.
- Do not use Node-only APIs or `process.env` in `apps/api/src/**`.
- Do not revert changes you did not make.
- If the task requires current Cloudflare Email Sending, Queues, or Wrangler behavior, load the relevant local skill/docs or fetch current official Cloudflare documentation before editing.
