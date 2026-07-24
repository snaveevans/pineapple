import { Email, UserId, VerificationTokenId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  VerificationTokenRecord,
  VerificationTokenRepository,
} from "../ports/VerificationTokenRepository.ts";
import type { VerificationTokenService } from "../ports/VerificationTokenService.ts";
import { ConfirmEmailVerification } from "./ConfirmEmailVerification.ts";

const authEmail = Email.from("dale@example.com");
const contactEmail = Email.from("contact@example.com");
const now = new Date("2026-07-02T12:00:00.000Z");

function unverifiedUser(): User {
  const user = User.create(authEmail);
  user.setUnverifiedNotificationEmail(contactEmail);
  user.pullEvents();
  return user;
}

function verifiedUser(): User {
  const user = User.create(authEmail);
  user.setVerifiedNotificationEmail(contactEmail, new Date("2026-07-02T12:00:00.000Z"));
  user.pullEvents();
  return user;
}

class UserRepoFake implements UserRepository {
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

class TokenRepoFake implements VerificationTokenRepository {
  consumed: VerificationTokenId[] = [];
  constructor(private record: VerificationTokenRecord | null) {}
  save(): Promise<void> {
    return Promise.resolve();
  }
  findByHash(): Promise<VerificationTokenRecord | null> {
    return Promise.resolve(this.record);
  }
  invalidateOutstanding(): Promise<void> {
    return Promise.resolve();
  }
  consume(id: VerificationTokenId): Promise<void> {
    this.consumed.push(id);
    return Promise.resolve();
  }
}

const tokenService: VerificationTokenService = {
  generate: () => Promise.resolve({ token: "raw", tokenHash: "hash" }),
  hash: (token: string) => Promise.resolve(`hash:${token}`),
};

class EventBusFake implements EventBus {
  readonly events: DomainEvent[] = [];
  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const e of events) this.events.push(e);
    return Promise.resolve();
  }
  subscribe(): void {}
}

const clock: Clock = { now: () => now };

function record(
  user: User,
  overrides: Partial<VerificationTokenRecord> = {},
): VerificationTokenRecord {
  return {
    id: VerificationTokenId.generate(),
    userId: user.id,
    email: contactEmail,
    purpose: "notification_email",
    tokenHash: "hash:valid",
    createdAt: new Date(now.getTime() - 60 * 1000),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    consumedAt: null,
    ...overrides,
  };
}

function build(user: User | null, rec: VerificationTokenRecord | null) {
  const users = new UserRepoFake(user);
  const tokens = new TokenRepoFake(rec);
  const events = new EventBusFake();
  const useCase = new ConfirmEmailVerification(users, tokens, tokenService, events, clock);
  return { useCase, users, tokens, events };
}

describe("ConfirmEmailVerification", () => {
  it("verifies the address, consumes the token, and emits NotificationEmailVerified", async () => {
    const user = unverifiedUser();
    const tokenRecord = record(user);
    const { useCase, users, tokens, events } = build(user, tokenRecord);

    const result = await useCase.execute({ token: "valid" });

    expect(result.ok && result.value.status).toBe("verified");
    expect(tokens.consumed).toEqual([tokenRecord.id]);
    expect(users.saved?.notificationEmailVerifiedAt).toBe(now);
    expect(users.saved?.notificationEmail).toBe(contactEmail);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      type: "NotificationEmailVerified",
      userId: user.id,
    });
  });

  it("returns invalid for an unknown token", async () => {
    const { useCase, events, tokens } = build(unverifiedUser(), null);
    const result = await useCase.execute({ token: "nope" });
    expect(result.ok && result.value.status).toBe("invalid");
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("returns invalid for an expired token", async () => {
    const user = unverifiedUser();
    const { useCase, tokens, events } = build(
      user,
      record(user, { expiresAt: new Date(now.getTime() - 1) }),
    );
    const result = await useCase.execute({ token: "valid" });
    expect(result.ok && result.value.status).toBe("invalid");
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("returns invalid when the token expires at exactly now", async () => {
    const user = unverifiedUser();
    const { useCase, tokens, events } = build(user, record(user, { expiresAt: now }));
    const result = await useCase.execute({ token: "valid" });
    expect(result.ok && result.value.status).toBe("invalid");
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("returns invalid for a consumed/superseded token", async () => {
    const user = unverifiedUser();
    const { useCase, tokens, events } = build(
      user,
      record(user, { consumedAt: new Date(now.getTime()) }),
    );
    const result = await useCase.execute({ token: "valid" });
    expect(result.ok && result.value.status).toBe("invalid");
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("returns invalid when the address no longer matches the token", async () => {
    const user = unverifiedUser();
    const { useCase, users, tokens, events } = build(
      user,
      record(user, { email: Email.from("old@example.com") }),
    );
    const result = await useCase.execute({ token: "valid" });
    expect(result.ok && result.value.status).toBe("invalid");
    expect(users.saved).toBeNull();
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("is an idempotent success when the current address is already verified", async () => {
    const user = verifiedUser();
    const { useCase, tokens, events, users } = build(
      user,
      record(user, { consumedAt: new Date(now.getTime() - 30 * 1000) }),
    );
    const result = await useCase.execute({ token: "valid" });
    expect(result.ok && result.value.status).toBe("verified");
    // no re-consumption, no new event, no re-save
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
    expect(users.saved).toBeNull();
  });

  it("returns invalid when the token's user no longer exists", async () => {
    const orphanId = UserId.generate();
    const { useCase, tokens, events } = build(null, {
      id: VerificationTokenId.generate(),
      userId: orphanId,
      email: contactEmail,
      purpose: "notification_email",
      tokenHash: "hash:valid",
      createdAt: new Date(now.getTime() - 60 * 1000),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      consumedAt: null,
    });
    const result = await useCase.execute({ token: "valid" });
    expect(result.ok && result.value.status).toBe("invalid");
    expect(tokens.consumed).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });
});
