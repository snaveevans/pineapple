import {
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
} from "@snaveevans/pineapple-shared";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { Clock } from "../ports/Clock.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { VerificationTokenRepository } from "../ports/VerificationTokenRepository.ts";
import type { VerificationTokenService } from "../ports/VerificationTokenService.ts";

export type ConfirmEmailVerificationCommand = {
  token: string;
};

/**
 * The result of a confirm attempt. `invalid` is the single, non-leaking outcome
 * for every unknown / expired / consumed / superseded / address-changed token —
 * it never reveals which case applied or whether the token ever existed.
 */
export type ConfirmEmailVerificationResult =
  | { readonly status: "verified" }
  | { readonly status: "invalid" };

/**
 * Confirms a presented verification token. On a valid, current token it marks the
 * caller's contact email verified (single-use). Confirming a still-current,
 * already-verified address is an idempotent success. Everything else collapses to
 * the generic `invalid` outcome.
 */
export class ConfirmEmailVerification {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: VerificationTokenRepository,
    private readonly tokenService: VerificationTokenService,
    private readonly eventBus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(
    cmd: ConfirmEmailVerificationCommand,
  ): Promise<Result<ConfirmEmailVerificationResult, DomainError>> {
    try {
      const tokenHash = await this.tokenService.hash(cmd.token);
      const record = await this.tokens.findByHash(tokenHash);
      if (!record) return ok({ status: "invalid" });

      const user = await this.users.findById(record.userId);
      if (!user) return ok({ status: "invalid" });

      const addressMatches = user.notificationEmail === record.email;

      // Idempotent success: the token's address is still current and already verified.
      if (addressMatches && user.notificationEmailVerifiedAt !== null) {
        return ok({ status: "verified" });
      }

      // Non-leaking invalid outcomes: consumed/superseded, expired, address changed.
      if (record.consumedAt !== null) return ok({ status: "invalid" });
      if (record.expiresAt.getTime() <= this.clock.now().getTime()) {
        return ok({ status: "invalid" });
      }
      if (!addressMatches) return ok({ status: "invalid" });

      await this.tokens.consume(record.id, this.clock.now());
      user.markNotificationEmailVerified(record.email);
      await this.users.save(user);
      await this.eventBus.publishAll(user.pullEvents());

      return ok({ status: "verified" });
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
