import type { Email, UserId } from "@snaveevans/pineapple-shared";
import type {
  VerificationSendLog,
  VerificationSendRecord,
} from "../../application/ports/VerificationSendLog.ts";
import type { VerificationPurpose } from "../../application/verification/VerificationPurpose.ts";

export class D1VerificationSendLog implements VerificationSendLog {
  constructor(private readonly db: D1Database) {}

  async record(entry: VerificationSendRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO email_verification_sends (id, user_id, email, purpose, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        entry.userId,
        entry.email,
        entry.purpose,
        entry.createdAt.toISOString(),
      )
      .run();
  }

  async latestSendToAddress(email: Email, purpose: VerificationPurpose): Promise<Date | null> {
    const row = await this.db
      .prepare(
        `SELECT MAX(created_at) AS latest FROM email_verification_sends
         WHERE email = ? AND purpose = ?`,
      )
      .bind(email, purpose)
      .first<{ latest: string | null }>();
    return row?.latest ? new Date(row.latest) : null;
  }

  async countSendsToAddressSince(
    email: Email,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM email_verification_sends
         WHERE email = ? AND purpose = ? AND created_at >= ?`,
      )
      .bind(email, purpose, since.toISOString())
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async countSendsByUserSince(
    userId: UserId,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM email_verification_sends
         WHERE user_id = ? AND purpose = ? AND created_at >= ?`,
      )
      .bind(userId, purpose, since.toISOString())
      .first<{ count: number }>();
    return row?.count ?? 0;
  }
}
