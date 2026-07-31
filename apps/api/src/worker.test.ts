import { describe, expect, it } from "vitest";
import { REQUEST_PATH_RELAYED_OUTBOX_REPOSITORIES } from "./worker.ts";
import { D1NotificationEmailOutboxRepository } from "./infrastructure/notifications/D1NotificationEmailOutboxRepository.ts";

describe("request-path outbox relay set (issue #70)", () => {
  it("does not relay the notification-email outbox on the request path", () => {
    // D1NotificationEmailOutboxRepository is relayed only from scheduled() in
    // worker.ts today. If a future request-path use case starts writing to
    // notification_email_outbox, add its repository to this list (and give it
    // a matching relay in the request-path middleware) — this test exists to
    // fail loudly if that relay is missed.
    expect(REQUEST_PATH_RELAYED_OUTBOX_REPOSITORIES).not.toContain(
      D1NotificationEmailOutboxRepository,
    );
  });
});
