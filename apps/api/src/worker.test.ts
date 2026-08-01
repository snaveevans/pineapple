import { describe, expect, it } from "vitest";
import { REQUEST_PATH_RELAYED_OUTBOX_REPOSITORIES } from "./worker.ts";
import { D1ActivityOutboxRepository } from "./infrastructure/activity/D1ActivityOutboxRepository.ts";
import { D1NotificationOutboxRepository } from "./infrastructure/notifications/D1NotificationOutboxRepository.ts";

describe("REQUEST_PATH_RELAYED_OUTBOX_REPOSITORIES (issue #70)", () => {
  it("pins the reviewed request-path relay set", () => {
    // This is a pin, not a closed-world guard: it fails on ANY change to this
    // list — including a correct fix that adds a repository here — forcing a
    // deliberate update. It does NOT detect a new write path to
    // notification_email_outbox introduced elsewhere that never touches this
    // list; see the comment above this constant in worker.ts.
    expect(REQUEST_PATH_RELAYED_OUTBOX_REPOSITORIES).toEqual([
      D1ActivityOutboxRepository,
      D1NotificationOutboxRepository,
    ]);
  });
});
