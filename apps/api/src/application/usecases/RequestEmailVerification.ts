import {
  ConflictError,
  type DomainError,
  DomainError as DomainErrorClass,
  type Email,
  InvariantError,
  NotFoundError,
  ok,
  err,
  type Result,
  TooManyRequestsError,
  type UserId,
  VerificationTokenId,
} from "@snaveevans/pineapple-shared";
import {
  EmailVerificationRequested,
  type VerificationRequestSource,
  type VerificationThrottleReason,
} from "../../domain/identity/events/EmailVerificationRequested.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EmailVerificationRequests } from "../ports/EmailVerificationRequests.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { TransactionalEmailSender } from "../ports/TransactionalEmailSender.ts";
import type { VerificationSendLog } from "../ports/VerificationSendLog.ts";
import type { VerificationTokenRepository } from "../ports/VerificationTokenRepository.ts";
import type { VerificationTokenService } from "../ports/VerificationTokenService.ts";
import type { VerificationPurpose } from "../verification/VerificationPurpose.ts";
import {
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_PER_ADDRESS_CAP,
  VERIFICATION_PER_USER_CAP,
  VERIFICATION_RATE_WINDOW_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from "../verification/verificationLimits.ts";

const PURPOSE: VerificationPurpose = "notification_email";

export type RequestEmailVerificationCommand = {
  userId: UserId;
  source: VerificationRequestSource;
};

/**
 * Issues (or refuses) a verification send for a user's current, unverified
 * contact email.
 *
 * - No contact email set → `ConflictError` (409), records a `no_address` decision.
 * - Current contact email already verified → idempotent no-op success.
 * - Any of the three rate limits exceeded → `TooManyRequestsError` (429), records
 *   a `throttled` decision with the tripped dimension; no token, no send.
 * - Otherwise supersedes prior tokens, issues a fresh hashed single-use token,
 *   records the send, puts the email on the wire, and records a `sent` decision.
 *
 * Implements {@link EmailVerificationRequests} so the profile set-path can drive it.
 */
export class RequestEmailVerification implements EmailVerificationRequests {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: VerificationTokenRepository,
    private readonly sendLog: VerificationSendLog,
    private readonly emailSender: TransactionalEmailSender,
    private readonly tokenService: VerificationTokenService,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
    private readonly buildVerificationLink: (token: string) => string,
  ) {}

  request(input: { userId: UserId; email: Email }): Promise<Result<void, DomainError>> {
    return this.execute({ userId: input.userId, source: "profile_update" });
  }

  async execute(cmd: RequestEmailVerificationCommand): Promise<Result<void, DomainError>> {
    try {
      const user = await this.users.findById(cmd.userId);
      if (!user) return err(new NotFoundError("User not found"));

      const email = user.notificationEmail;
      if (email === null) {
        await this.#record(cmd.userId, cmd.source, "no_address", "none");
        return err(new ConflictError("No contact email to verify"));
      }

      if (user.notificationEmailVerifiedAt !== null) {
        await this.#record(cmd.userId, cmd.source, "noop_already_verified", "none");
        return ok(undefined);
      }

      const throttle = await this.#throttleReason(cmd.userId, email);
      if (throttle !== "none") {
        await this.#record(cmd.userId, cmd.source, "throttled", throttle);
        return err(new TooManyRequestsError("Verification email requested too frequently"));
      }

      const sent = await this.#issue(cmd.userId, email);
      if (!sent) {
        // The send passed every limit and a token was issued, but the provider
        // send failed. Surface it (500) so the caller can retry immediately, and
        // record it as send_failed rather than mislabeling it sent.
        await this.#record(cmd.userId, cmd.source, "send_failed", "none");
        return err(new InvariantError("Verification email send failed"));
      }
      await this.#record(cmd.userId, cmd.source, "sent", "none");
      return ok(undefined);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }

  async #throttleReason(userId: UserId, email: Email): Promise<VerificationThrottleReason> {
    const now = this.clock.now();

    const latest = await this.sendLog.latestSendToAddress(email, PURPOSE);
    if (latest !== null && now.getTime() - latest.getTime() < VERIFICATION_COOLDOWN_MS) {
      return "cooldown";
    }

    const since = new Date(now.getTime() - VERIFICATION_RATE_WINDOW_MS);

    const perAddress = await this.sendLog.countSendsToAddressSince(email, PURPOSE, since);
    if (perAddress >= VERIFICATION_PER_ADDRESS_CAP) return "per_address_cap";

    const perUser = await this.sendLog.countSendsByUserSince(userId, PURPOSE, since);
    if (perUser >= VERIFICATION_PER_USER_CAP) return "per_user_cap";

    return "none";
  }

  /**
   * Issues a fresh token and puts the verification email on the wire. Returns
   * whether the send reached the provider. The send is recorded against the rate
   * limits **only on success**, so a provider failure never consumes the user's
   * cooldown or daily quota (letting them retry immediately).
   */
  async #issue(userId: UserId, email: Email): Promise<boolean> {
    await this.tokens.invalidateOutstanding(userId, email, PURPOSE);

    const now = this.clock.now();
    const { token, tokenHash } = await this.tokenService.generate();
    await this.tokens.save({
      id: VerificationTokenId.generate(),
      userId,
      email,
      purpose: PURPOSE,
      tokenHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
      consumedAt: null,
    });

    const link = this.buildVerificationLink(token);
    const result = await this.emailSender.send({
      to: { address: email },
      subject: "Verify your Pineapple contact email",
      text: `Confirm this is your email by opening the link below. It expires in 24 hours.\n\n${link}\n\nIf you didn't request this, you can ignore this message.`,
    });
    if (result.status === "failed") {
      console.error(
        { retryable: result.retryable, reason: result.reason },
        "verification email send failed",
      );
      return false;
    }

    await this.sendLog.record({ userId, email, purpose: PURPOSE, createdAt: now });
    return true;
  }

  #record(
    userId: UserId,
    source: VerificationRequestSource,
    result: "sent" | "throttled" | "noop_already_verified" | "no_address" | "send_failed",
    throttleReason: VerificationThrottleReason,
  ): Promise<void> {
    return this.eventBus.publish(
      EmailVerificationRequested({ userId, source, result, throttleReason }),
    );
  }
}
