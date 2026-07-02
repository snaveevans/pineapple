import type { Email, UserId, VerificationTokenId } from "@snaveevans/pineapple-shared";
import type { VerificationPurpose } from "../verification/VerificationPurpose.ts";

/**
 * A stored verification token. The raw token is NEVER persisted — only its hash
 * (`tokenHash`). A presented token is matched by hashing it and looking it up.
 * Scoped by `(userId, email, purpose)`.
 */
export interface VerificationTokenRecord {
  id: VerificationTokenId;
  userId: UserId;
  email: Email;
  purpose: VerificationPurpose;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Set when the token was consumed (confirmed) or invalidated (superseded). */
  consumedAt: Date | null;
}

/**
 * Port: persistence for hashed, single-use verification tokens.
 */
export interface VerificationTokenRepository {
  save(token: VerificationTokenRecord): Promise<void>;
  /** Looks a token up by its hash; returns null when unknown. */
  findByHash(tokenHash: string): Promise<VerificationTokenRecord | null>;
  /**
   * Marks every still-outstanding token for the scope consumed, so a newly issued
   * send (or an address change) supersedes all prior links.
   */
  invalidateOutstanding(userId: UserId, email: Email, purpose: VerificationPurpose): Promise<void>;
  /** Marks a single token consumed (single-use confirmation). */
  consume(id: VerificationTokenId, consumedAt: Date): Promise<void>;
}
