import { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import type {
  EmailBatchRecord,
  EmailBatchRepository,
} from "../../application/ports/EmailBatchRepository.ts";
import type {
  EmailBatchStatus,
  EmailSuppressReason,
} from "../../application/notifications/notificationTypes.ts";

type Row = {
  id: string;
  owner_id: string;
  status: string;
  suppress_reason: string | null;
  notification_count: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, owner_id, status, suppress_reason, notification_count, created_at, updated_at";

export class D1EmailBatchRepository implements EmailBatchRepository {
  constructor(private readonly db: D1Database) {}

  async save(b: EmailBatchRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO email_batches (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           status = excluded.status,
           suppress_reason = excluded.suppress_reason,
           notification_count = excluded.notification_count,
           updated_at = excluded.updated_at`,
      )
      .bind(
        b.id,
        b.ownerId,
        b.status,
        b.suppressReason,
        b.notificationCount,
        b.createdAt.toISOString(),
        b.updatedAt.toISOString(),
      )
      .run();
  }

  async findById(id: EmailBatchId): Promise<EmailBatchRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM email_batches WHERE id = ?`)
      .bind(id)
      .first<Row>();
    return row ? rowToRecord(row) : null;
  }

  async updateOutcome(
    id: EmailBatchId,
    status: EmailBatchStatus,
    suppressReason: EmailSuppressReason | null,
    updatedAt: Date,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE email_batches SET status = ?, suppress_reason = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(status, suppressReason, updatedAt.toISOString(), id)
      .run();
  }
}

function rowToRecord(row: Row): EmailBatchRecord {
  return {
    id: EmailBatchId.from(row.id),
    ownerId: UserId.from(row.owner_id),
    status: row.status as EmailBatchStatus,
    suppressReason: (row.suppress_reason as EmailSuppressReason | null) ?? null,
    notificationCount: row.notification_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
