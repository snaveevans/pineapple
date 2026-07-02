You are working in `/Users/tyler/workspace/pineapple` on the current branch. Read `AGENTS.md`, `PLAN.md`, and `TASKS.md` before making changes.

This loop must incorporate the local `spec-implement` skill. If the skill is available in your environment, invoke it. In all cases, read and follow these files directly before editing:

- `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/SKILL.md`
- `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/layer-checklist.md`

Your job is to perform exactly one implementation loop:

1. Find the first unchecked task in `TASKS.md` whose line starts with `- [ ]`.
2. Treat that task as the entire scope for this loop. Do not start the next unchecked task.
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

12. Stop after the commit and report the commit hash, validation commands run, and any residual risk.

Rules:

- Do not batch multiple `TASKS.md` items into one loop.
- Do not skip ahead unless the first unchecked task is already complete in the codebase; if so, validate it, check it off, commit the checkbox/update, and stop.
- Do not implement parked archive/unarchive work from `docs/specs/backlog/archive-asset.md`.
- Do not implement web UX yet. The designer has not produced the web designs. Do not add or modify profile contact-email UI, a `/verify-email` page, notifications inbox/bell behavior, `apps/web/**`, or `docs/web/FEATURES.md` unless a future task explicitly updates this plan after design is available.
- Do not hand-edit `docs/reference/openapi.json`; generate it.
- Do not put PII into Analytics Engine telemetry.
- Do not use Node-only APIs or `process.env` in `apps/api/src/**`.
- Do not revert changes you did not make.
- If the task requires current Cloudflare Email Sending, Queues, or Wrangler behavior, load the relevant local skill/docs or fetch current official Cloudflare documentation before editing.
