import { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import type { EventBus } from "../../application/ports/EventBus.ts";
import type {
  EmailDeliveryResult,
  TransactionalEmail,
  TransactionalEmailSender,
} from "../../application/ports/TransactionalEmailSender.ts";
import type { ReminderEmailMessage } from "./ReminderEmailMessage.ts";
import { processReminderEmailMessage } from "./ReminderEmailQueueConsumer.ts";

class EmailSenderFake implements TransactionalEmailSender {
  sent: TransactionalEmail | null = null;

  constructor(private readonly result: EmailDeliveryResult) {}

  send(email: TransactionalEmail): Promise<EmailDeliveryResult> {
    this.sent = email;
    return Promise.resolve(this.result);
  }
}

const eventBus: EventBus = {
  publish: () => Promise.resolve(),
  publishAll: () => Promise.resolve(),
  subscribe: () => undefined,
};

const clock = { now: () => new Date("2026-07-02T10:30:00.000Z") };

function message(batchId = EmailBatchId.generate()): ReminderEmailMessage {
  return {
    id: batchId,
    type: "ReminderEmailRequested",
    schemaVersion: "v1",
    occurredAt: "2026-07-02T10:00:00.000Z",
    batchId,
    ownerId: UserId.generate(),
  };
}

function dbHarness(opts: { sendRetryable?: boolean } = {}) {
  const batchId = EmailBatchId.generate();
  const ownerId = UserId.generate();
  const statements: { query: string; values: unknown[] }[] = [];
  const prepare = vi.fn((query: string) => ({
    bind: (...values: unknown[]) => {
      statements.push({ query, values });
      return {
        first: vi.fn().mockResolvedValue(firstRow(query, batchId, ownerId)),
        all: vi.fn().mockResolvedValue({ results: allRows(query, ownerId) }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
    },
  }));
  return {
    batchId,
    db: { prepare } as unknown as D1Database,
    statements,
    sender: new EmailSenderFake(
      opts.sendRetryable
        ? { status: "failed", retryable: true, reason: "provider down" }
        : { status: "sent" },
    ),
  };
}

describe("processReminderEmailMessage", () => {
  it("dispatches a reminder email message through the application use case", async () => {
    const { batchId, db, statements, sender } = dbHarness();

    await processReminderEmailMessage(message(batchId), { db, emailSender: sender, eventBus, clock });

    expect(sender.sent?.to.address).toBe("contact@example.com");
    expect(sender.sent?.text).toContain("Truck: Oil change, due 2026-07-09");
    expect(statements.some((s) => s.query.includes("UPDATE email_batches SET status = ?"))).toBe(
      true,
    );
  });

  it("throws on retryable send failures so queue delivery can redeliver", async () => {
    const { batchId, db, sender } = dbHarness({ sendRetryable: true });

    await expect(
      processReminderEmailMessage(message(batchId), { db, emailSender: sender, eventBus, clock }),
    ).rejects.toThrow("failed with retryable error");
  });
});

function firstRow(query: string, batchId: EmailBatchId, ownerId: UserId): unknown {
  if (query.includes("FROM email_batches")) {
    return {
      id: batchId,
      owner_id: ownerId,
      status: "pending",
      suppress_reason: null,
      notification_count: 1,
      created_at: "2026-07-02T10:00:00.000Z",
      updated_at: "2026-07-02T10:00:00.000Z",
    };
  }
  if (query.includes("FROM users")) {
    return {
      id: ownerId,
      email: "auth@example.com",
      name: null,
      onboarding_completed_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      notification_email: "contact@example.com",
      notification_email_verified_at: "2026-07-01T00:00:00.000Z",
    };
  }
  return null;
}

function allRows(query: string, ownerId: UserId): unknown[] {
  if (!query.includes("FROM notifications")) return [];
  return [
    {
      id: "notification-1",
      owner_id: ownerId,
      actor_id: "system",
      type: "maintenance_due_soon",
      maintenance_task_id: "task-1",
      asset_id: "asset-1",
      asset_name: "Truck",
      asset_type: "vehicle",
      task_title: "Oil change",
      next_due: "2026-07-09",
      created_at: "2026-07-02T10:00:00.000Z",
      read_at: null,
    },
  ];
}
