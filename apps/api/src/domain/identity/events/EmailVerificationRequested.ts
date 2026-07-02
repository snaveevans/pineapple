import type { UserId } from "@snaveevans/pineapple-shared";
import { createDomainEventMetadata, type DomainEvent } from "../../events/DomainEvent.ts";

export type VerificationRequestSource = "profile_update" | "resend";

export type VerificationRequestResult =
  | "sent"
  | "throttled"
  | "noop_already_verified"
  | "no_address";

export type VerificationThrottleReason = "cooldown" | "per_address_cap" | "per_user_cap" | "none";

/**
 * Emitted on every verification-send decision — accepted sends and rate-limited
 * rejections alike — so the throttle is observable. Carries only non-PII ids and
 * enums; never the email address or the token.
 */
export type EmailVerificationRequested = DomainEvent & {
  type: "EmailVerificationRequested";
  userId: UserId;
  purpose: "notification_email";
  source: VerificationRequestSource;
  result: VerificationRequestResult;
  throttleReason: VerificationThrottleReason;
};

export const EmailVerificationRequested = (props: {
  userId: UserId;
  source: VerificationRequestSource;
  result: VerificationRequestResult;
  throttleReason: VerificationThrottleReason;
}): EmailVerificationRequested => ({
  ...createDomainEventMetadata(),
  type: "EmailVerificationRequested",
  userId: props.userId,
  purpose: "notification_email",
  source: props.source,
  result: props.result,
  throttleReason: props.throttleReason,
});
