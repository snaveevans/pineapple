import { Email, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { UpdateUserProfile } from "./UpdateUserProfile.ts";

class RecordingUserRepository implements UserRepository {
  saved: User | null = null;

  constructor(private user: User | null) {}

  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findByIds(): Promise<User[]> {
    return Promise.resolve(this.user ? [this.user] : []);
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
    for (const event of events) {
      this.events.push(event);
    }
    return Promise.resolve();
  }

  subscribe(): void {}
}

describe("UpdateUserProfile", () => {
  it("persists the profile and publishes onboarding completion on first update", async () => {
    const user = User.create(Email.from("dale@example.com"), "Dale");
    const repo = new RecordingUserRepository(user);
    const eventBus = new RecordingEventBus();

    const result = await new UpdateUserProfile(repo, eventBus).execute({
      userId: user.id,
      name: "DIYer Dale",
    });

    expect(result.ok).toBe(true);
    expect(repo.saved?.name).toBe("DIYer Dale");
    expect(repo.saved?.onboardingCompletedAt).not.toBeNull();
    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.events[0]?.type).toBe("UserOnboardingCompleted");
  });

  it("publishes UserNameUpdated when a completed user changes their name", async () => {
    const user = User.create(Email.from("dale@example.com"), "Dale");
    user.updateProfile("Dale");
    user.pullEvents();

    const repo = new RecordingUserRepository(user);
    const eventBus = new RecordingEventBus();

    const result = await new UpdateUserProfile(repo, eventBus).execute({
      userId: user.id,
      name: "New Dale",
    });

    expect(result.ok).toBe(true);
    expect(repo.saved?.name).toBe("New Dale");
    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.events[0]?.type).toBe("UserNameUpdated");
  });

  it("returns not found when the user does not exist", async () => {
    const result = await new UpdateUserProfile(
      new RecordingUserRepository(null),
      new RecordingEventBus(),
    ).execute({
      userId: UserId.generate(),
      name: "Dale",
    });

    expect(result.ok).toBe(false);
  });
});
