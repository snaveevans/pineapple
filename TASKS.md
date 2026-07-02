# Implementation Tasks

Work one unchecked task per turn. Pick the first `- [ ]` item, complete only that item, validate it against `PLAN.md`, change it to `- [x]`, stage the changed files, and commit. Under the `/goal` session (see `GOAL_PROMPT.md`), the goal evaluator then starts the next turn for the next unchecked task until every item is `- [x]` and the Final Completion Gate passes.

## Foundation

- [x] Add `TooManyRequestsError` support. Update `packages/shared/errors.ts`, `apps/api/src/api/errors.ts`, request telemetry status mapping/tests, `docs/specs/cross-cutting/error-handling.md`, and any imports. Validate with `pnpm lint`, `pnpm type-check`, and `pnpm -r test`.

- [x] Add shared primitives for the upcoming work. Add branded ids for notifications, scheduled reminders, verification tokens, and email batches; add one shared maintenance due-soon/reminder lead constant so dashboard and notifications use the same 7-day policy. Replace existing hardcoded dashboard/task-status 7-day use sites. Validate with focused tests plus `pnpm lint`, `pnpm type-check`, and `pnpm -r test`.

- [x] Enrich maintenance task events with `nextDue`. Update `MaintenanceTaskCreated` and `MaintenanceTaskAdvanced` event types/factories, populate `nextDue` in `MaintenanceTask.create()` and `advance()`, update tests and any queue/message validators affected by event shape. Do not add `nextDue` to Analytics Engine telemetry blobs. Validate with maintenance task/application tests plus the full check.

## User Contact Email

- [x] Extend the domain `User` with contact-email state. Add nullable `notificationEmail` and `notificationEmailVerifiedAt`, domain methods for setting unverified email, setting verified email, removing email, and marking verified, plus `NotificationEmailUpdated`, `NotificationEmailRemoved`, and `NotificationEmailVerified` events. Add/extend domain tests. Validate with `pnpm lint`, `pnpm type-check`, and `pnpm -r test`.

- [x] Persist contact-email state. Add a D1 migration for `users.notification_email` and `users.notification_email_verified_at`; update `D1UserRepository`, repository tests, and `docs/reference/data-model.md` for the domain user fields/events. Apply the migration locally. Validate with migration apply, lint, type-check, and tests.

- [x] Expose provider verified-email context to application code. Extend the auth resolver/context so contact-email use cases can compare against the provider-controlled auth email and know whether the provider asserted it as verified, without making route handlers call Better Auth directly. Cover real-session and `DEV_AUTH_EMAIL` behavior in tests. Validate with the full check.

- [x] Implement contact-email application use cases. Add `SetNotificationEmail` and `RemoveNotificationEmail`, a verification-request port used by the set path, and tests for auto-verify provider match, unverified non-provider email, idempotent verified re-submit, address change, removal, and rate-limit error propagation. Validate with the full check.

- [x] Add contact-email API contracts and handlers. Extend `UserProfileResponseSchema`; add `PUT /api/users/me/notification-email` and `DELETE /api/users/me/notification-email` schemas, route specs, worker handlers, serialization, technical telemetry mappings/tests, and generated OpenAPI. Validate with OpenAPI generation, lint, type-check, and tests.

## Email Verification

- [x] Add the transactional email application port. Define provider-agnostic request/result types that cover verification emails and reminder emails, with application tests/fakes where needed. Do not add Cloudflare-specific types outside infrastructure. Validate with the full check.

- [x] Add email verification storage. Create D1 tables/repositories for verification tokens and verification-send rate-limit/audit records. Tokens must be hashed at rest and scoped by `(user, email, purpose)`. Include repository tests and update `docs/reference/data-model.md`. Apply migrations locally and run the full check.

- [x] Implement verification token and rate-limit use cases. Add request/resend logic with 60-second cooldown, 5 per-address rolling 24h cap across users, 10 per-user rolling 24h cap, prior-token invalidation, `EmailVerificationRequested` event emission, and no-op behavior for already verified addresses. Validate with focused unit tests and the full check.

- [x] Implement email verification confirmation. Add `ConfirmEmailVerification` with token hashing, 24-hour TTL, single-use consumption, superseded/current-address checks, generic invalid outcome, idempotent success for already verified current address, and `NotificationEmailVerified` event emission. Validate with focused unit tests and the full check.

- [x] Add email verification API contracts and unauthenticated confirm route. Add `POST /api/users/me/notification-email/verification` and public `POST /api/verify-email`, Zod schemas, OpenAPI route specs, worker wiring before the auth gate for confirm, technical telemetry mappings/tests, `authentication.md` exception update, and generated OpenAPI. Validate with OpenAPI generation and the full check.

- [x] Add Cloudflare Email Sending infrastructure. Implement the email adapter behind the email port, add Worker binding/config in `apps/api/wrangler.toml`, document required SPF/DKIM/DMARC setup, wire verification email sending, and add tests around adapter input construction using current Cloudflare docs. Validate with lint, type-check, and tests.

## Notification Storage And Scheduling

- [x] Add notification domain/storage models. Create tables, repositories, and branded-id usage for scheduled reminders, notifications, email batches, notification event dedupe/order state, and notification dead letters. Update `docs/reference/data-model.md`; apply migrations locally; add repository tests; run the full check.

- [x] Add notification scheduling message contracts. Define inbound queue message types/factories/validators for enriched `MaintenanceTaskCreated`, `MaintenanceTaskAdvanced`, and `MaintenanceTaskDeleted` events carrying the snapshot/title/`nextDue` needed by notifications. Ensure PII does not go to telemetry blobs. Validate with message conversion/validation tests and the full check.

- [x] Implement the inbound notification event consumer. Consume maintenance task event messages, dedupe by event id, schedule/reschedule/cancel reminders keyed by task, preserve snapshots, compute `fireAt = nextDue - lead`, and resolve out-of-order delivery by event occurrence time/version. Add unit tests and DLQ persistence tests. Validate with the full check.

- [x] Wire inbound notification queue delivery. Add producer outbox/relay or equivalent durable enqueue path for maintenance task events to the notification queue, configure the queue and DLQ in `wrangler.toml`, update `.github/workflows/deploy.yml`, and dispatch the correct consumer from `worker.queue()`. Validate with lint, type-check, tests, and config review.

- [ ] Implement the one-time reminder bootstrap. Seed scheduled reminders idempotently from existing tasks on active assets, deduped on `(taskId, nextDue)`, with copied asset/task snapshots and computed `fireAt`. Keep this as launch bootstrap only, not steady-state scheduling. Add tests or migration verification and run required checks.

- [ ] Implement the notification sweep use case. Scan only notifications-owned scheduled-reminder state for `pending` reminders where `fireAt <= today`; create one `maintenance_due_soon` notification per `(taskId, nextDue)` idempotently; mark reminders fired; group created notifications by owner; record `MaintenanceReminderCreated` events. Validate with focused tests and the full check.

## Notification API

- [ ] Implement notification inbox read use case. Add owner-scoped cursor pagination, newest-first ordering with stable tie-breaker, unread count, self-contained asset/task snapshots, deleted/archived renderability, and no `ownerId` exposure. Validate with application/repository tests and the full check.

- [ ] Implement mark-read use cases. Add mark-one and mark-all behavior, owner scoping, 404 for unknown/foreign notification ids, idempotent already-read success, and unread count result for mark-all. Validate with tests and the full check.

- [ ] Add notification API contracts and handlers. Add `GET /api/notifications`, `POST /api/notifications/{notificationId}/read`, and `POST /api/notifications/read-all` schemas, route specs, worker handlers, technical telemetry mappings/tests, and generated OpenAPI. Validate with OpenAPI generation and the full check.

## Reminder Email Delivery

- [ ] Add email batch creation to the sweep. For each owner with notifications created in one sweep, create one email batch and enqueue one outbound email job atomically with the reminder changes. Ensure in-app notifications remain one per task and email aggregation is per owner per sweep. Validate with sweep tests and the full check.

- [ ] Implement outbound reminder email consumer. Resolve verified contact email at send time, send through the email port only when verified, record `sent` / `suppressed` / `failed` outcomes with suppress reasons, make redelivery idempotent on batch id, and emit `ReminderEmailDispatched` telemetry events without PII. Validate with focused tests and the full check.

- [ ] Wire outbound email queue and DLQ. Add queue bindings/consumers to `wrangler.toml`, idempotent creation entries to `.github/workflows/deploy.yml`, worker queue dispatch, durable DLQ draining into D1, and tests for malformed/exhausted jobs. Validate with lint, type-check, tests, and config review.

- [ ] Add notification telemetry handlers. Implement `MaintenanceReminderCreated` and `ReminderEmailDispatched` Analytics Engine handlers, add the `NOTIFICATION_DOMAIN_TELEMETRY` binding/dataset, register handlers, update `docs/specs/cross-cutting/telemetry.md`, and verify no PII is written. Validate with telemetry tests and the full check.

## Final Consistency

- [ ] Regenerate and audit API/reference documentation. Run OpenAPI generation, update `docs/reference/openapi.json`, confirm `docs/reference/data-model.md` documents only domain/storage/event details, and ensure active specs/cross-cutting specs match implemented route and telemetry names. Validate with `git diff --exit-code docs/reference/openapi.json` after generation and the full check.

- [ ] Run final branch verification. Run `pnpm --filter @snaveevans/pineapple-api openapi:generate`, `git diff --exit-code docs/reference/openapi.json`, `pnpm lint`, `pnpm type-check`, and `pnpm -r test`. Fix only final integration drift, mark this task complete, stage, commit, and stop.
