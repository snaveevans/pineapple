import {
  type DomainError,
  Email,
  err,
  ok,
  type Result,
  TooManyRequestsError,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EmailVerificationRequests } from "../ports/EmailVerificationRequests.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { SetNotificationEmail } from "./SetNotificationEmail.ts";

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
    for (const event of events) this.events.push(event);
    return Promise.resolve();
  }

  subscribe(): void {}
}

class VerificationRequestsFake implements EmailVerificationRequests {
  readonly requests: { userId: UserId; email: Email }[] = [];

  constructor(private result: Result<void, DomainError> = ok(undefined)) {}

  request(input: { userId: UserId; email: Email }): Promise<Result<void, DomainError>> {
    this.requests.push(input);
    return Promise.resolve(this.result);
  }
}

const authEmail = Email.from("dale@example.com");
const contactEmail = Email.from("contact@example.com");
const verifiedAt = new Date("2026-07-02T12:00:00.000Z");
const clock: Clock = { now: () => verifiedAt };

function eventTypes(bus: RecordingEventBus): string[] {
  return bus.events.map((e) => e.type);
}

describe("SetNotificationEmail", () => {
  it("auto-verifies an address that matches the provider-verified auth email", async () => {
    const user = User.create(authEmail);
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();
    const verifications = new VerificationRequestsFake();

    const result = await new SetNotificationEmail(repo, bus, verifications, clock).execute({
      userId: user.id,
      email: authEmail,
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: true,
    });

    expect(result.ok).toBe(true);
    expect(repo.saved?.notificationEmail).toBe(authEmail);
    expect(repo.saved?.notificationEmailVerifiedAt).not.toBeNull();
    expect(eventTypes(bus)).toEqual(["NotificationEmailUpdated", "NotificationEmailVerified"]);
    expect(verifications.requests).toHaveLength(0);
  });

  it("stores a non-provider address unverified and requests a verification send", async () => {
    const user = User.create(authEmail);
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();
    const verifications = new VerificationRequestsFake();

    const result = await new SetNotificationEmail(repo, bus, verifications, clock).execute({
      userId: user.id,
      email: contactEmail,
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: true,
    });

    expect(result.ok).toBe(true);
    expect(repo.saved?.notificationEmail).toBe(contactEmail);
    expect(repo.saved?.notificationEmailVerifiedAt).toBeNull();
    expect(eventTypes(bus)).toEqual(["NotificationEmailUpdated"]);
    expect(verifications.requests).toEqual([{ userId: user.id, email: contactEmail }]);
  });

  it("stores unverified and sends when the address matches an unverified provider email", async () => {
    const user = User.create(authEmail);
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();
    const verifications = new VerificationRequestsFake();

    const result = await new SetNotificationEmail(repo, bus, verifications, clock).execute({
      userId: user.id,
      email: authEmail,
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: false,
    });

    expect(result.ok).toBe(true);
    expect(repo.saved?.notificationEmailVerifiedAt).toBeNull();
    expect(verifications.requests).toHaveLength(1);
  });

  it("is an idempotent no-op when re-submitting the current verified address", async () => {
    const user = User.create(authEmail);
    user.setVerifiedNotificationEmail(contactEmail, verifiedAt);
    user.pullEvents();
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();
    const verifications = new VerificationRequestsFake();

    const result = await new SetNotificationEmail(repo, bus, verifications, clock).execute({
      userId: user.id,
      email: contactEmail,
      // provider is a different address, so only idempotency can apply
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: true,
    });

    expect(result.ok).toBe(true);
    expect(repo.saved).toBeNull();
    expect(bus.events).toHaveLength(0);
    expect(verifications.requests).toHaveLength(0);
  });

  it("stores a changed address unverified and drops prior verified state", async () => {
    const user = User.create(authEmail);
    user.setVerifiedNotificationEmail(Email.from("old@example.com"), verifiedAt);
    user.pullEvents();
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();
    const verifications = new VerificationRequestsFake();

    const result = await new SetNotificationEmail(repo, bus, verifications, clock).execute({
      userId: user.id,
      email: contactEmail,
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: true,
    });

    expect(result.ok).toBe(true);
    expect(repo.saved?.notificationEmail).toBe(contactEmail);
    expect(repo.saved?.notificationEmailVerifiedAt).toBeNull();
    expect(eventTypes(bus)).toEqual(["NotificationEmailUpdated"]);
    expect(verifications.requests).toHaveLength(1);
  });

  it("propagates a rate-limit error but keeps the address stored unverified", async () => {
    const user = User.create(authEmail);
    const repo = new RecordingUserRepository(user);
    const bus = new RecordingEventBus();
    const verifications = new VerificationRequestsFake(
      err(new TooManyRequestsError("Too many verification requests")),
    );

    const result = await new SetNotificationEmail(repo, bus, verifications, clock).execute({
      userId: user.id,
      email: contactEmail,
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    // The address is still persisted, unverified, per the spec.
    expect(repo.saved?.notificationEmail).toBe(contactEmail);
    expect(repo.saved?.notificationEmailVerifiedAt).toBeNull();
  });

  it("returns not found when the user does not exist", async () => {
    const result = await new SetNotificationEmail(
      new RecordingUserRepository(null),
      new RecordingEventBus(),
      new VerificationRequestsFake(),
      clock,
    ).execute({
      userId: UserId.generate(),
      email: contactEmail,
      providerAuthEmail: authEmail,
      providerAuthEmailVerified: true,
    });

    expect(result.ok).toBe(false);
  });
});
