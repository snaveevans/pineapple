import type { EmailBatchId, UserId } from "@snaveevans/pineapple-shared";
import type { EmailBatchStatus, EmailSuppressReason } from "../notifications/notificationTypes.ts";

export interface EmailBatchRecord {
  id: EmailBatchId;
  ownerId: UserId;
  status: EmailBatchStatus;
  suppressReason: EmailSuppressReason | null;
  notificationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Port: aggregated reminder-email batches — one per owner per sweep. The outbound
 * consumer is idempotent on the batch id and records the final outcome here.
 */
export interface EmailBatchRepository {
  save(batch: EmailBatchRecord): Promise<void>;
  findById(id: EmailBatchId): Promise<EmailBatchRecord | null>;
  updateOutcome(
    id: EmailBatchId,
    status: EmailBatchStatus,
    suppressReason: EmailSuppressReason | null,
    updatedAt: Date,
  ): Promise<void>;
}
