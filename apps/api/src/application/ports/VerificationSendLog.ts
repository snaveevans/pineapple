import type { Email, UserId } from "@snaveevans/pineapple-shared";
import type { VerificationPurpose } from "../verification/VerificationPurpose.ts";

/**
 * An audit record of one verification-send attempt, used both as an audit trail
 * and as the backing store for the anti-abuse rate limits.
 */
export interface VerificationSendRecord {
  userId: UserId;
  email: Email;
  purpose: VerificationPurpose;
  createdAt: Date;
}

/**
 * Port: durable record of verification sends supporting the three rate-limit
 * dimensions — a per-address cooldown, a per-address rolling-24h cap (across all
 * users), and a per-user rolling-24h cap.
 */
export interface VerificationSendLog {
  record(entry: VerificationSendRecord): Promise<void>;
  /** Most recent send to this address for the purpose (any user), for the cooldown check. */
  latestSendToAddress(email: Email, purpose: VerificationPurpose): Promise<Date | null>;
  /** Count of sends to this address for the purpose (across all users) at or after `since`. */
  countSendsToAddressSince(
    email: Email,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<number>;
  /** Count of sends initiated by this user for the purpose at or after `since`. */
  countSendsByUserSince(userId: UserId, purpose: VerificationPurpose, since: Date): Promise<number>;
}
