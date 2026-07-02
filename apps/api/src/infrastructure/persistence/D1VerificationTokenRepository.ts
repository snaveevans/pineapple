import { Email, UserId, VerificationTokenId } from "@snaveevans/pineapple-shared";
import type {
  VerificationTokenRecord,
  VerificationTokenRepository,
} from "../../application/ports/VerificationTokenRepository.ts";
import {
  isVerificationPurpose,
  type VerificationPurpose,
} from "../../application/verification/VerificationPurpose.ts";

type TokenRow = {
  id: string;
  user_id: string;
  email: string;
  purpose: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

const COLUMNS = "id, user_id, email, purpose, token_hash, created_at, expires_at, consumed_at";

export class D1VerificationTokenRepository implements VerificationTokenRepository {
  constructor(private readonly db: D1Database) {}

  async save(token: VerificationTokenRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO email_verification_tokens (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        token.id,
        token.userId,
        token.email,
        token.purpose,
        token.tokenHash,
        token.createdAt.toISOString(),
        token.expiresAt.toISOString(),
        token.consumedAt?.toISOString() ?? null,
      )
      .run();
  }

  async findByHash(tokenHash: string): Promise<VerificationTokenRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM email_verification_tokens WHERE token_hash = ?`)
      .bind(tokenHash)
      .first<TokenRow>();
    return row ? this.#rowToRecord(row) : null;
  }

  async invalidateOutstanding(
    userId: UserId,
    email: Email,
    purpose: VerificationPurpose,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE email_verification_tokens
         SET consumed_at = ?
         WHERE user_id = ? AND email = ? AND purpose = ? AND consumed_at IS NULL`,
      )
      .bind(new Date().toISOString(), userId, email, purpose)
      .run();
  }

  async consume(id: VerificationTokenId, consumedAt: Date): Promise<void> {
    await this.db
      .prepare(
        `UPDATE email_verification_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
      )
      .bind(consumedAt.toISOString(), id)
      .run();
  }

  #rowToRecord(row: TokenRow): VerificationTokenRecord {
    if (!isVerificationPurpose(row.purpose)) {
      throw new Error(`Unknown verification purpose in storage: ${row.purpose}`);
    }
    return {
      id: VerificationTokenId.from(row.id),
      userId: UserId.from(row.user_id),
      email: Email.from(row.email),
      purpose: row.purpose,
      tokenHash: row.token_hash,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    };
  }
}
