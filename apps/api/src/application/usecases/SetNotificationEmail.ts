import {
  type DomainError,
  DomainError as DomainErrorClass,
  type Email,
  NotFoundError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EmailVerificationRequests } from "../ports/EmailVerificationRequests.ts";
import type { EventBus } from "../ports/EventBus.ts";

export type SetNotificationEmailCommand = {
  userId: UserId;
  /** The submitted contact email, already normalized via the `Email` value object. */
  email: Email;
  /** The caller's provider-controlled auth email (from the authenticated session). */
  providerAuthEmail: Email;
  /** Whether the identity provider asserts the auth email is verified. */
  providerAuthEmailVerified: boolean;
};

/**
 * Sets or changes a user's contact / notification email.
 *
 * - Re-submitting the current, already-verified address is an idempotent no-op.
 * - An address that equals the caller's provider-verified auth email is stored
 *   verified immediately (no token, no send) — the provider already proved it.
 * - Any other address is stored unverified (clearing prior verified state) and a
 *   verification send is requested. A rate-limited send still leaves the address
 *   stored unverified but surfaces the error (→ 429).
 */
export class SetNotificationEmail {
  constructor(
    private readonly users: UserRepository,
    private readonly eventBus: EventBus,
    private readonly verificationRequests: EmailVerificationRequests,
  ) {}

  async execute(cmd: SetNotificationEmailCommand): Promise<Result<User, DomainError>> {
    try {
      const user = await this.users.findById(cmd.userId);
      if (!user) return err(new NotFoundError("User not found"));

      // Idempotent: the current address is already verified — nothing to do.
      if (user.notificationEmail === cmd.email && user.notificationEmailVerifiedAt !== null) {
        return ok(user);
      }

      // Provider already proved ownership of this address → store verified.
      if (cmd.email === cmd.providerAuthEmail && cmd.providerAuthEmailVerified) {
        user.setVerifiedNotificationEmail(cmd.email);
        await this.users.save(user);
        await this.eventBus.publishAll(user.pullEvents());
        return ok(user);
      }

      // Otherwise store unverified and request a verification send.
      user.setUnverifiedNotificationEmail(cmd.email);
      await this.users.save(user);
      await this.eventBus.publishAll(user.pullEvents());

      const sent = await this.verificationRequests.request({
        userId: user.id,
        email: cmd.email,
      });
      if (!sent.ok) return err(sent.error);

      return ok(user);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
