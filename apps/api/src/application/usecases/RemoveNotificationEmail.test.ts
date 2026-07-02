import { Email, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { RemoveNotificationEmail } from "./RemoveNotificationEmail.ts";

class RecordingUserRepository implements UserRepository {
  saved: User | null = null;

  constructor(private user: User | null) {}

  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  save(user: User): Promise<void> {
    this.saved = user;
    return Promise.resolve();
  }
}

class RecordingEventBus implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) this.events.push(event);
    return Promise.resolve();
  }

  subscribe(): void {}
}

const authEmail = Email.from("dale@example.com");

describe("RemoveNotificationEmail", () => {
  it("clears the contact email and publishes NotificationEmailRemoved", async () => {
    const user = User.create(authEmail);
    user.setVerifiedNotificationEmail(
      Email.from("contact@example.com"),
      new Date("2026-07-02T12:00:00.000Z"),
    );
    user.pullEvents();
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();

    const result = await new RemoveNotificationEmail(repo, bus).execute({ userId: user.id });

    expect(result.ok).toBe(true);
    expect(repo.saved?.notificationEmail).toBeNull();
    expect(repo.saved?.notificationEmailVerifiedAt).toBeNull();
    expect(bus.events.map((e) => e.type)).toEqual(["NotificationEmailRemoved"]);
  });

  it("is an idempotent no-op when no contact email is set", async () => {
    const user = User.create(authEmail);
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();

    const result = await new RemoveNotificationEmail(repo, bus).execute({ userId: user.id });

    expect(result.ok).toBe(true);
    expect(repo.saved).toBeNull();
    expect(bus.events).toHaveLength(0);
  });

  it("returns not found when the user does not exist", async () => {
    const result = await new RemoveNotificationEmail(
      new RecordingUserRepository(null),
      new RecordingEventBus(),
    ).execute({ userId: UserId.generate() });

    expect(result.ok).toBe(false);
  });
});
