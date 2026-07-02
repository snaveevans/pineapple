import { ConflictError, Email, TooManyRequestsError, UserId } from "@snaveevans/pineapple-shared";
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
import { RequestEmailVerification } from "./RequestEmailVerification.ts";

const authEmail = Email.from("dale@example.com");
const contactEmail = Email.from("contact@example.com");
const now = new Date("2026-07-02T12:00:00.000Z");

function userWith(state: "none" | "unverified" | "verified"): User {
  const user = User.create(authEmail);
  if (state === "unverified") user.setUnverifiedNotificationEmail(contactEmail);
  if (state === "verified") user.setVerifiedNotificationEmail(contactEmail);
  user.pullEvents();
  return user;
}

class UserRepoFake implements UserRepository {
  constructor(private user: User | null) {}
  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
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
  const event = events.events.find((e) => e.type === "EmailVerificationRequested");
  return event as { result: string; throttleReason: string; source: string } | undefined;
}

describe("RequestEmailVerification", () => {
  it("issues a hashed token, records the send, and emails a link on the happy path", async () => {
    const { useCase, tokens, sendLog, emailSender, events } = build({
      user: userWith("unverified"),
    });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok).toBe(true);
    // supersede happens before the new token is saved
    expect(tokens.invalidated).toHaveLength(1);
    expect(tokens.saved).toHaveLength(1);
    expect(tokens.saved[0]?.tokenHash).toBe("hashed-token");
    expect(tokens.saved[0]?.expiresAt.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
    expect(sendLog.recorded).toHaveLength(1);
    expect(emailSender.sent[0]?.to.address).toBe(contactEmail);
    expect(emailSender.sent[0]?.text).toContain("verify-email?token=raw-token");
    const event = lastRequestEvent(events);
    expect(event).toMatchObject({ result: "sent", throttleReason: "none", source: "resend" });
  });

  it("uses profile_update source via the request() port method", async () => {
    const events = new EventBusFake();
    const { useCase } = build({ user: userWith("unverified"), events });

    await useCase.request({ userId: UserId.generate(), email: contactEmail });

    expect(lastRequestEvent(events)?.source).toBe("profile_update");
  });

  it("returns 409 and records no_address when no contact email is set", async () => {
    const { useCase, tokens, emailSender, events } = build({ user: userWith("none") });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(ConflictError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expect(lastRequestEvent(events)?.result).toBe("no_address");
  });

  it("is an idempotent no-op when the contact email is already verified", async () => {
    const { useCase, tokens, emailSender, events } = build({ user: userWith("verified") });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok).toBe(true);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expect(lastRequestEvent(events)?.result).toBe("noop_already_verified");
  });

  it("throttles on the cooldown window", async () => {
    const sendLog = new SendLogFake(new Date(now.getTime() - 30 * 1000));
    const { useCase, tokens, emailSender, events } = build({
      user: userWith("unverified"),
      sendLog,
    });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    expect(tokens.saved).toHaveLength(0);
    expect(emailSender.sent).toHaveLength(0);
    expect(lastRequestEvent(events)).toMatchObject({
      result: "throttled",
      throttleReason: "cooldown",
    });
  });

  it("throttles on the per-address daily cap", async () => {
    const sendLog = new SendLogFake(null, 5, 0);
    const { useCase, events } = build({ user: userWith("unverified"), sendLog });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    expect(lastRequestEvent(events)?.throttleReason).toBe("per_address_cap");
  });

  it("throttles on the per-user daily cap", async () => {
    const sendLog = new SendLogFake(null, 0, 10);
    const { useCase, events } = build({ user: userWith("unverified"), sendLog });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok === false && result.error).toBeInstanceOf(TooManyRequestsError);
    expect(lastRequestEvent(events)?.throttleReason).toBe("per_user_cap");
  });

  it("still issues the token when the email send reports a failure", async () => {
    const emailSender = new EmailSenderFake({
      status: "failed",
      retryable: true,
      reason: "provider down",
    });
    const { useCase, tokens } = build({ user: userWith("unverified"), emailSender });

    const result = await useCase.execute({ userId: UserId.generate(), source: "resend" });

    expect(result.ok).toBe(true);
    expect(tokens.saved).toHaveLength(1);
  });
});
