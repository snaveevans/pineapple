# Implementation Plan

This branch is decision-complete and ready for implementation planning. The active scope comes from:

- `docs/specs/features/maintenance-task.md`
- `docs/specs/features/user-profile.md`
- `docs/specs/features/email-verification.md`
- `docs/specs/features/notifications.md`
- `docs/decisions/0011-reliable-event-delivery-via-cloudflare-queues.md`
- `docs/decisions/0012-transactional-email-via-cloudflare-email-sending.md`
- `docs/decisions/0013-reminder-scheduler-via-cron-sweeps.md`
- `docs/decisions/0014-layered-error-handling-policy.md`
- Cross-cutting specs under `docs/specs/cross-cutting/`

`docs/specs/backlog/archive-asset.md` is parked. Do not implement archive/unarchive, task suspension/reactivation, archive action routes, or archive-driven notification cancellation in this loop.

## Objective

Implement verified contact email and maintenance due-soon notifications end to end:

- Maintenance task lifecycle events carry the resulting `nextDue` needed by durable consumers.
- Users can store, verify, resend verification for, and remove one contact/notification email.
- Verification sends are tokenized, single-use, hashed at rest, rate-limited, and delivered through an email port.
- Notifications consumes enriched maintenance task events through a durable queue, maintains its own scheduled reminder state, sweeps that state by cron, creates a durable in-app inbox, and enqueues one aggregated reminder email per owner per sweep.
- Reminder email delivery is idempotent, resolves the verified contact email at send time, records `sent` / `suppressed` / `failed`, and persists exhausted DLQ messages durably.
- OpenAPI, `data-model.md`, cross-cutting specs, and telemetry docs are kept consistent with the code.

Web UX is intentionally out of scope for this implementation plan. The designer has not produced the interaction/design work yet, so do not add profile contact-email UI, a `/verify-email` page, a notifications inbox, bell behavior, or `docs/web/FEATURES.md` updates in these loops. Backend API contracts should be ready for future web work, but `apps/web/**` should remain untouched unless a task explicitly says otherwise after design is available.

## Non-Negotiable Constraints

- Respect the layer rules in `AGENTS.md` / `CLAUDE.md`. Dependencies point inward only.
- API route specs and Zod schemas live in `apps/api/src/api/**`; route handlers and infrastructure wiring live in `apps/api/src/worker.ts`.
- Use cases return `Result<T, DomainError>` and do not throw domain errors. HTTP handlers throw `result.error` to central mapping.
- `apps/api/src/**` targets Cloudflare Workers, not Node. Do not use Node-only APIs or `process.env`.
- Use explicit `.ts` extensions for source imports.
- `openapi.json` is generated, never hand-edited.
- Do not duplicate API field tables in `docs/reference/data-model.md`; that file only documents domain/storage/event details the API spec cannot express.
- Queues declared in `apps/api/wrangler.toml` must also be created idempotently in `.github/workflows/deploy.yml`.
- Analytics Engine telemetry must not contain PII: no email addresses, token values, asset names, task titles, or user-supplied names in telemetry blobs.
- Notification scheduling must not read maintenance-task or asset storage during steady state. It uses enriched events plus its own tables. The only allowed read-back is the one-time launch bootstrap.

## Implementation Shape

Use the existing architecture and patterns:

- Shared: branded ids, date helpers, `DomainError` subclasses, `Result`.
- Domain: aggregates, value objects, and domain events only.
- Application: use cases and ports.
- Infrastructure: D1 repositories, queue consumers, email adapter, telemetry handlers.
- API: Zod schemas, OpenAPI route specs, central error mapping, request telemetry mapping.
- Worker: composition root, route handlers, queue dispatch, scheduled dispatch.

Each implementation loop must follow the local `spec-implement` skill in spirit and, when available to the agent, directly:

- Read `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/SKILL.md`.
- Read `/Users/tyler/workspace/pineapple/.claude/skills/spec-implement/layer-checklist.md`.
- Use the layer order and relevant checklist items for the task.
- Run the prescribed validation before marking the task complete.
- Implement only the current task's delta; do not broaden into adjacent unchecked tasks.

## Workstreams And Dependencies

### Foundation

Add `TooManyRequestsError`, required branded ids, and shared date/lead constants before building features that depend on them.

`MaintenanceTaskCreated` and `MaintenanceTaskAdvanced` must carry `nextDue` before notification scheduling is implemented. Existing activity-history messages do not need to render `nextDue`, but their validators/tests must keep passing.

### User Contact Email

Extend the domain `User` and `users` table with:

- `notificationEmail`
- `notificationEmailVerifiedAt`

Add domain events:

- `NotificationEmailUpdated`
- `NotificationEmailRemoved`
- `NotificationEmailVerified`

The provider auth email remains read-only and distinct from the contact email. Auto-verification only applies when the submitted contact email equals the caller's provider-verified auth email after normalization.

### Email Verification

Use this feature's own D1 tables, not Better Auth's singular `verification` table.

Implement:

- Hashed, high-entropy, single-use token storage.
- Token TTL of 24 hours.
- Superseding/invalidating outstanding tokens for `(user, email, purpose)`.
- Rate limits: 60-second cooldown per address, 5 sends per address per rolling 24h across all users, 10 sends per user per rolling 24h.
- `TooManyRequestsError` for rejected sends.
- `POST /api/users/me/notification-email/verification` as protected resend.
- `POST /api/verify-email` as unauthenticated confirm.

### Email Port

Create one provider-agnostic application port for transactional email. Use it for both verification emails and aggregated reminder emails. The Cloudflare Email Sending adapter and Worker binding are infrastructure details.

Agents implementing this portion should fetch current Cloudflare Email Sending / Wrangler docs before editing config or adapter code.

### Notifications

Introduce domain/storage concepts for:

- Scheduled reminders, keyed by source maintenance task and cycle.
- In-app notifications.
- Email batches and delivery attempts/outcomes.
- Event ingestion dedupe/order markers.
- Durable dead letters for the two notification queues and DLQs.

Queues:

- Inbound maintenance-task notification queue + DLQ.
- Outbound aggregated reminder email queue + DLQ.

The inbound queue consumes enriched `MaintenanceTaskCreated`, `MaintenanceTaskAdvanced`, and `MaintenanceTaskDeleted` messages. It schedules/reschedules/cancels reminders in notifications-owned tables, dedupes by source event id, and uses event time/version so late older events cannot override newer state.

The cron sweep scans notifications-owned scheduled-reminder state for `pending` reminders where `fireAt <= today`, creates one `maintenance_due_soon` notification per task/cycle idempotently, marks reminders `fired`, records `MaintenanceReminderCreated`, and enqueues one email batch per owner per sweep.

The outbound email consumer resolves the contact email at send time. It sends only when the owner has a verified contact email, records `suppressed` for absent/unverified emails, records `failed` for permanent send failures, and does not send twice on redelivery of the same batch id.

### API Endpoints

Add or extend:

- `GET /api/users/me`
- `PATCH /api/users/me`
- `PUT /api/users/me/notification-email`
- `DELETE /api/users/me/notification-email`
- `POST /api/users/me/notification-email/verification`
- `POST /api/verify-email`
- `GET /api/notifications`
- `POST /api/notifications/{notificationId}/read`
- `POST /api/notifications/read-all`

Every new route needs:

- Zod schemas with OpenAPI metadata.
- Route spec in `apps/api/src/api/openapi.ts`.
- Worker handler wiring.
- Technical telemetry operation mapping and tests.
- OpenAPI regeneration.

## Required Validation

Each task in `TASKS.md` names focused checks. At minimum, after a task changes TypeScript code:

```bash
pnpm lint
pnpm type-check
pnpm -r test
```

After API schemas/routes change:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
pnpm lint
pnpm type-check
pnpm -r test
```

After migrations change:

```bash
pnpm --filter @snaveevans/pineapple-api wrangler d1 migrations apply pineapple --local
pnpm lint
pnpm type-check
pnpm -r test
```

If a command cannot be run, record the reason in the final response and do not mark the task complete unless the task is genuinely complete and the missing validation is external.

## Definition Of Done Per Task

A task is complete only when:

- The task's code/docs are implemented and scoped to that task.
- Relevant tests are added or updated.
- Required generated artifacts are updated.
- Relevant docs named in the task are updated.
- Required validation commands pass.
- The corresponding checkbox in `TASKS.md` is changed from `[ ]` to `[x]`.
- The task changes, including the checkbox update, are staged and committed.

Use small commits. Do not start the next unchecked task in the same loop.

Commit messages must end with:

```text
Co-Authored-By: Codex <codex@openai.com>
```

## Final Completion Gate

After the final task, the branch should pass:

```bash
pnpm --filter @snaveevans/pineapple-api openapi:generate
git diff --exit-code docs/reference/openapi.json
pnpm lint
pnpm type-check
pnpm -r test
```

The final branch should have no active spec flags, no open questions, no stale review status, and no implementation drift from the active specs listed above.
