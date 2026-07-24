import {
  ConflictError,
  Email,
  InvariantError,
  NotFoundError,
  TooManyRequestsError,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type {
  EmailDeliveryResult,
  TransactionalEmail,
  TransactionalEmailSender,
} from "../ports/TransactionalEmailSender.ts";
import type { VerificationSendLog } from "../ports/VerificationSendLog.ts";
import type {
  VerificationTokenRecord,
  VerificationTokenRepository,
} from "../ports/VerificationTokenRepository.ts";
import type { VerificationTokenService } from "../ports/VerificationTokenService.ts";
import {
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_PER_ADDRESS_CAP,
  VERIFICATION_PER_USER_CAP,
  VERIFICATION_TOKEN_TTL_MS,
} from "../verification/verificationLimits.ts";
import { RequestEmailVerification } from "./RequestEmailVerification.ts";

const authEmail = Email.from("dale@example.com");
const contactEmail = Email.from("contact@example.com");
const now = new Date("2026-07-02T12:00:00.000Z");

function userWith(state: "none" | "unverified" | "verified"): User {
  const user = User.create(authEmail);
  if (state === "unverified") user.setUnverifiedNotificationEmail(contactEmail);
  if (state === "verified")
    user.setVerifiedNotificationEmail(contactEmail, new Date("2026-07-02T12:00:00.000Z"));
  user.pullEvents();
  return user;
}

class UserRepoFake implements UserRepository {
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
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class TokenRepoFake implements VerificationTokenRepository {
  readonly invalidated: unknown[] = [];
  readonly saved: VerificationTokenRecord[] = [];
  invalidateOutstanding(userId: UserId, email: Email, purpose: string): Promise<void> {
    this.invalidated.push({ userId, email, purpose });
    return Promise.resolve();
  }
  save(token: VerificationTokenRecord): Promise<void> {
    this.saved.push(token);
    return Promise.resolve();
  }
  findByHash(): Promise<VerificationTokenRecord | null> {
    return Promise.resolve(null);
  }
  consume(): Promise<void> {
    return Promise.resolve();
  }
}

class SendLogFake implements VerificationSendLog {
  readonly recorded: unknown[] = [];
  constructor(
    private latest: Date | null = null,
    private addressCount = 0,
    private userCount = 0,
  ) {}
  record(entry: { userId: UserId; email: Email }): Promise<void> {
    this.recorded.push(entry);
    return Promise.resolve();
  }
  latestSendToAddress(): Promise<Date | null> {
    return Promise.resolve(this.latest);
  }
  countSendsToAddressSince(): Promise<number> {
    return Promise.resolve(this.addressCount);
  }
  countSendsByUserSince(): Promise<number> {
    return Promise.resolve(this.userCount);
  }
}

class EmailSenderFake implements TransactionalEmailSender {
  readonly sent: TransactionalEmail[] = [];
  constructor(private result: EmailDeliveryResult = { status: "sent" }) {}
  send(email: TransactionalEmail): Promise<EmailDeliveryResult> {
    this.sent.push(email);
    return Promise.resolve(this.result);
  }
}

class TokenServiceFake implements VerificationTokenService {
  generate(): Promise<{ token: string; tokenHash: string }> {
    return Promise.resolve({ token: "raw-token", tokenHash: "hashed-token" });
  }
  hash(token: string): Promise<string> {
    return Promise.resolve(`hash:${token}`);
  }
}

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

function build(opts: {
  user: User | null;
  sendLog?: SendLogFake;
  emailSender?: EmailSenderFake;
  tokens?: TokenRepoFake;
  events?: EventBusFake;
}) {
  const tokens = opts.tokens ?? new TokenRepoFake();
  const sendLog = opts.sendLog ?? new SendLogFake();
  const emailSender = opts.emailSender ?? new EmailSenderFake();
  const events = opts.events ?? new EventBusFake();
  const useCase = new RequestEmailVerification(
    new UserRepoFake(opts.user),
    tokens,
    sendLog,
    emailSender,
    new TokenServiceFake(),
    events,
    clock,
    (token) => `https://app.example/verify-email?token=${token}`,
  );
  return { useCase, tokens, sendLog, emailSender, events };
}

function lastRequestEvent(events: EventBusFake) {
  return events.events.find((e) => e.type === "EmailVerificationRequested");
}

function expectRequestEvent(
  events: EventBusFake,
  expected: {
    userId: UserId;
    source: "resend" | "profile_update";
    result: "sent" | "throttled" | "noop_already_verified" | "no_address" | "send_failed";
    throttleReason: "cooldown" | "per_address_cap" | "per_user_cap" | "none";
  },
) {
  const event = lastRequestEvent(events);
  expect(event).toMatchObject({
    type: "EmailVerificationRequested",
    userId: expected.userId,
    purpose: "notification_email",
    source: expected.source,
    result: expected.result,
    throttleReason: expected.throttleReason,
  });
}

describe("RequestEmailVerification", () => {
  it("issues a hashed token, records the send, and emails a link on the happy path", async () => {
    const user = userWith("unverified");
    const { useCase, tokens, sendLog, emailSender, events } = build({ user });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok).toBe(true);
    // supersede happens before the new token is saved
    expect(tokens.invalidated).toHaveLength(1);
    expect(tokens.saved).toHaveLength(1);
    expect(tokens.saved[0]?.tokenHash).toBe("hashed-token");
    expect(tokens.saved[0]?.userId).toBe(user.id);
    expect(tokens.saved[0]?.email).toBe(contactEmail);
    expect(tokens.saved[0]?.purpose).toBe("notification_email");
    expect(tokens.saved[0]?.expiresAt.getTime()).toBe(now.getTime() + VERIFICATION_TOKEN_TTL_MS);
    expect(sendLog.recorded).toEqual([
      { userId: user.id, email: contactEmail, purpose: "notification_email", createdAt: now },
    ]);
    expect(emailSender.sent[0]?.to.address).toBe(contactEmail);
    expect(emailSender.sent[0]?.text).toContain("verify-email?token=raw-token");
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "sent",
      throttleReason: "none",
    });
  });

  it("uses profile_update source via the request() port method", async () => {
    const user = userWith("unverified");
    const events = new EventBusFake();
    const { useCase } = build({ user, events });

    const result = await useCase.request({ userId: user.id, email: contactEmail });

    expect(result.ok).toBe(true);
    expectRequestEvent(events, {
      userId: user.id,
      source: "profile_update",
      result: "sent",
      throttleReason: "none",
    });
  });

  it("returns NotFound when the user does not exist", async () => {
    const userId = UserId.generate();
    const { useCase, tokens, emailSender, events } = build({ user: null });

    const result = await useCase.execute({ userId, source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(NotFoundError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("returns 409 and records no_address when no contact email is set", async () => {
    const user = userWith("none");
    const { useCase, tokens, emailSender, events } = build({ user });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(ConflictError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "no_address",
      throttleReason: "none",
    });
  });

  it("is an idempotent no-op when the contact email is already verified", async () => {
    const user = userWith("verified");
    const { useCase, tokens, emailSender, events } = build({ user });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok).toBe(true);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "noop_already_verified",
      throttleReason: "none",
    });
  });

  it("throttles on the cooldown window", async () => {
    const user = userWith("unverified");
    const sendLog = new SendLogFake(new Date(now.getTime() - 30 * 1000));
    const { useCase, tokens, emailSender, events } = build({ user, sendLog });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "throttled",
      throttleReason: "cooldown",
    });
  });

  it("allows a send once the cooldown window has fully elapsed", async () => {
    const user = userWith("unverified");
    // Exactly at the cooldown boundary: now - latest === COOLDOWN is not throttled (< not <=).
    const sendLog = new SendLogFake(new Date(now.getTime() - VERIFICATION_COOLDOWN_MS));
    const { useCase, events } = build({ user, sendLog });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok).toBe(true);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "sent",
      throttleReason: "none",
    });
  });

  it("throttles on the per-address daily cap", async () => {
    const user = userWith("unverified");
    const sendLog = new SendLogFake(null, VERIFICATION_PER_ADDRESS_CAP, 0);
    const { useCase, tokens, emailSender, events } = build({ user, sendLog });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "throttled",
      throttleReason: "per_address_cap",
    });
  });

  it("allows a send when the per-address count is just under the cap", async () => {
    const user = userWith("unverified");
    const sendLog = new SendLogFake(null, VERIFICATION_PER_ADDRESS_CAP - 1, 0);
    const { useCase, events } = build({ user, sendLog });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok).toBe(true);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "sent",
      throttleReason: "none",
    });
  });

  it("throttles on the per-user daily cap", async () => {
    const user = userWith("unverified");
    const sendLog = new SendLogFake(null, 0, VERIFICATION_PER_USER_CAP);
    const { useCase, tokens, emailSender, events } = build({ user, sendLog });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "throttled",
      throttleReason: "per_user_cap",
    });
  });

  it("allows a send when the per-user count is just under the cap", async () => {
    const user = userWith("unverified");
    const sendLog = new SendLogFake(null, 0, VERIFICATION_PER_USER_CAP - 1);
    const { useCase, events } = build({ user, sendLog });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    expect(result.ok).toBe(true);
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "sent",
      throttleReason: "none",
    });
  });

  it("returns 500 and records send_failed without counting the send when the provider fails", async () => {
    const user = userWith("unverified");
    const sendLog = new SendLogFake();
    const emailSender = new EmailSenderFake({
      status: "failed",
      retryable: true,
      reason: "provider down",
    });
    const { useCase, tokens, events } = build({
      user,
      sendLog,
      emailSender,
    });

    const result = await useCase.execute({ userId: user.id, source: "resend" });

    // A failed send is not an expected outcome: the request fails with 500.
    expect(result.ok === false && result.error).toBeInstanceOf(InvariantError);
    // The token was still issued (prior tokens invalidated, fresh token saved)...
    expect(tokens.invalidated).toHaveLength(1);
    expect(tokens.saved).toHaveLength(1);
    // ...but a failed send is NOT counted against the cooldown / daily caps.
    expect(sendLog.recorded).toHaveLength(0);
    // ...and it is observable as send_failed rather than mislabeled sent.
    expectRequestEvent(events, {
      userId: user.id,
      source: "resend",
      result: "send_failed",
      throttleReason: "none",
    });
  });
});
