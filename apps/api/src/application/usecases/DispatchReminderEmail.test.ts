import {
  AssetId,
  Email,
  EmailBatchId,
  MaintenanceTaskId,
  NotificationId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EmailBatchRecord, EmailBatchRepository } from "../ports/EmailBatchRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
} from "../ports/NotificationRepository.ts";
import type {
  EmailDeliveryResult,
  TransactionalEmail,
  TransactionalEmailSender,
} from "../ports/TransactionalEmailSender.ts";
import type { Clock } from "../ports/Clock.ts";
import { DispatchReminderEmail } from "./DispatchReminderEmail.ts";

class EmailBatchRepoFake implements EmailBatchRepository {
  outcome: {
    id: EmailBatchId;
    status: "sent" | "suppressed" | "failed";
    suppressReason: "no_contact_email" | "unverified" | "none" | null;
    updatedAt: Date;
  } | null = null;

  constructor(private readonly batch: EmailBatchRecord | null) {}

  save(): Promise<void> {
    return Promise.resolve();
  }

  findById(): Promise<EmailBatchRecord | null> {
    return Promise.resolve(this.batch);
  }

  updateOutcome(
    id: EmailBatchId,
    status: "sent" | "suppressed" | "failed",
    suppressReason: "no_contact_email" | "unverified" | "none" | null,
    updatedAt: Date,
  ): Promise<void> {
    this.outcome = { id, status, suppressReason, updatedAt };
    return Promise.resolve();
  }
}

class NotificationRepoFake implements NotificationRepository {
  listedBatch: { batchId: EmailBatchId; ownerId: UserId } | null = null;

  constructor(private readonly notifications: NotificationRecord[]) {}

  insertIfAbsent(): Promise<boolean> {
    return Promise.resolve(false);
  }

  listByEmailBatch(batchId: EmailBatchId, ownerId: UserId): Promise<NotificationRecord[]> {
    this.listedBatch = { batchId, ownerId };
    return Promise.resolve(this.notifications);
  }

  findByIdForOwner(): Promise<NotificationRecord | null> {
    return Promise.resolve(null);
  }

  listByOwner(): Promise<NotificationPage> {
    return Promise.resolve({ notifications: [], nextCursor: null });
  }

  countUnread(): Promise<number> {
    return Promise.resolve(0);
  }

  markRead(): Promise<void> {
    return Promise.resolve();
  }

  markAllRead(): Promise<void> {
    return Promise.resolve();
  }
}

class UserRepoFake implements UserRepository {
  constructor(private readonly user: User | null) {}

  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findByIds(): Promise<User[]> {
    return Promise.resolve(this.user ? [this.user] : []);
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class EmailSenderFake implements TransactionalEmailSender {
  sent: TransactionalEmail | null = null;

  constructor(private readonly result: EmailDeliveryResult = { status: "sent" }) {}

  send(email: TransactionalEmail): Promise<EmailDeliveryResult> {
    this.sent = email;
    return Promise.resolve(this.result);
  }
}

class EventBusFake implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }

  subscribe(): void {}
}

const now = new Date("2026-07-02T10:30:00.000Z");
const clock: Clock = { now: () => now };

function batch(overrides: Partial<EmailBatchRecord> = {}): EmailBatchRecord {
  return {
    id: EmailBatchId.generate(),
    ownerId: UserId.generate(),
    status: "pending",
    suppressReason: null,
    notificationCount: 2,
    createdAt: new Date("2026-07-02T10:00:00.000Z"),
    updatedAt: new Date("2026-07-02T10:00:00.000Z"),
    ...overrides,
  };
}

function verifiedUser(ownerId: UserId, email = "owner@example.com"): User {
  return User.reconstitute({
    id: ownerId,
    email: Email.from("auth@example.com"),
    name: "Owner",
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    notificationEmail: Email.from(email),
    notificationEmailVerifiedAt: new Date("2026-07-01T00:00:00.000Z"),
  });
}

function unverifiedUser(ownerId: UserId): User {
  return User.reconstitute({
    id: ownerId,
    email: Email.from("auth@example.com"),
    name: null,
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    notificationEmail: Email.from("contact@example.com"),
    notificationEmailVerifiedAt: null,
  });
}

function noContactUser(ownerId: UserId): User {
  return User.reconstitute({
    id: ownerId,
    email: Email.from("auth@example.com"),
    name: null,
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    notificationEmail: null,
    notificationEmailVerifiedAt: null,
  });
}

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: NotificationId.generate(),
    ownerId: UserId.generate(),
    actorId: "system",
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.generate(),
    assetId: AssetId.generate(),
    assetName: "Truck",
    assetType: "vehicle",
    taskTitle: "Oil change",
    nextDue: "2026-07-09",
    createdAt: now,
    readAt: null,
    ...overrides,
  };
}

function makeUseCase(input: {
  batch: EmailBatchRecord | null;
  user: User | null;
  notifications?: NotificationRecord[];
  sendResult?: EmailDeliveryResult;
}) {
  const batches = new EmailBatchRepoFake(input.batch);
  const notifications = new NotificationRepoFake(input.notifications ?? []);
  const users = new UserRepoFake(input.user);
  const sender = new EmailSenderFake(input.sendResult);
  const events = new EventBusFake();
  const useCase = new DispatchReminderEmail(batches, notifications, users, sender, events, clock);
  return { useCase, batches, notifications, sender, events };
}

describe("DispatchReminderEmail", () => {
  it("sends an aggregated reminder email to the owner's verified contact email", async () => {
    const ownerId = UserId.generate();
    const b = batch({ ownerId });
    const n = notification({ ownerId, assetName: "Van", taskTitle: "Rotate tires" });
    const { useCase, batches, notifications, sender, events } = makeUseCase({
      batch: b,
      user: verifiedUser(ownerId),
      notifications: [n],
    });

    const result = await useCase.execute({ emailBatchId: b.id });

    expect(result.ok).toBe(true);
    expect(sender.sent).toMatchObject({
      to: { address: Email.from("owner@example.com"), name: "Owner" },
      subject: "Upcoming maintenance reminders",
    });
    expect(sender.sent?.text).toContain("Van: Rotate tires, due 2026-07-09");
    expect(notifications.listedBatch).toEqual({ batchId: b.id, ownerId });
    expect(batches.outcome).toEqual({
      id: b.id,
      status: "sent",
      suppressReason: "none",
      updatedAt: now,
    });
    expect(events.events).toEqual([
      expect.objectContaining({
        type: "ReminderEmailDispatched",
        emailBatchId: b.id,
        ownerId,
        result: "sent",
        suppressReason: "none",
        notificationCount: 2,
      }),
    ]);
  });

  it("suppresses without sending when the owner has no contact email", async () => {
    const ownerId = UserId.generate();
    const b = batch({ ownerId });
    const { useCase, batches, sender, events } = makeUseCase({
      batch: b,
      user: noContactUser(ownerId),
    });

    const result = await useCase.execute({ emailBatchId: b.id });

    expect(result.ok).toBe(true);
    expect(sender.sent).toBeNull();
    expect(batches.outcome).toEqual({
      id: b.id,
      status: "suppressed",
      suppressReason: "no_contact_email",
      updatedAt: now,
    });
    expect(events.events[0]).toMatchObject({
      type: "ReminderEmailDispatched",
      result: "suppressed",
      suppressReason: "no_contact_email",
      notificationCount: 2,
    });
  });

  it("suppresses without sending when the contact email is unverified", async () => {
    const ownerId = UserId.generate();
    const b = batch({ ownerId });
    const { useCase, batches, sender, events } = makeUseCase({
      batch: b,
      user: unverifiedUser(ownerId),
    });

    const result = await useCase.execute({ emailBatchId: b.id });

    expect(result.ok).toBe(true);
    expect(sender.sent).toBeNull();
    expect(batches.outcome).toEqual({
      id: b.id,
      status: "suppressed",
      suppressReason: "unverified",
      updatedAt: now,
    });
    expect(events.events[0]).toMatchObject({
      type: "ReminderEmailDispatched",
      result: "suppressed",
      suppressReason: "unverified",
    });
  });

  it("records permanent send failures and emits a non-PII event", async () => {
    const ownerId = UserId.generate();
    const b = batch({ ownerId });
    const { useCase, batches, events } = makeUseCase({
      batch: b,
      user: verifiedUser(ownerId),
      notifications: [notification({ ownerId })],
      sendResult: { status: "failed", retryable: false, reason: "blocked" },
    });

    const result = await useCase.execute({ emailBatchId: b.id });

    expect(result.ok).toBe(true);
    expect(batches.outcome).toEqual({
      id: b.id,
      status: "failed",
      suppressReason: "none",
      updatedAt: now,
    });
    expect(events.events[0]).toMatchObject({
      type: "ReminderEmailDispatched",
      result: "failed",
      suppressReason: "none",
      notificationCount: 2,
    });
    expect(JSON.stringify(events.events[0])).not.toContain("owner@example.com");
    expect(JSON.stringify(events.events[0])).not.toContain("Oil change");
  });

  it("leaves retryable failures pending so the queue can redeliver", async () => {
    const ownerId = UserId.generate();
    const b = batch({ ownerId });
    const { useCase, batches, events } = makeUseCase({
      batch: b,
      user: verifiedUser(ownerId),
      notifications: [notification({ ownerId })],
      sendResult: { status: "failed", retryable: true, reason: "provider down" },
    });

    const result = await useCase.execute({ emailBatchId: b.id });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual({ status: "retryable_failure", retryable: true });
    expect(batches.outcome).toBeNull();
    expect(events.events).toEqual([]);
  });

  it("does not send or re-emit when a redelivered batch is already processed", async () => {
    const ownerId = UserId.generate();
    const b = batch({ ownerId, status: "sent", suppressReason: "none" });
    const { useCase, batches, sender, events } = makeUseCase({
      batch: b,
      user: verifiedUser(ownerId),
    });

    const result = await useCase.execute({ emailBatchId: b.id });

    expect(result.ok).toBe(true);
    expect(sender.sent).toBeNull();
    expect(batches.outcome).toBeNull();
    expect(events.events).toEqual([]);
  });
});
