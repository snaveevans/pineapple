import type { MaintenanceTaskId } from "@snaveevans/pineapple-shared";

/**
 * Port: dedupe / order state for the inbound notification event consumer.
 * Records each processed source event by its stable id so at-least-once redelivery
 * is a no-op.
 */
export interface NotificationEventLog {
  hasProcessed(eventId: string): Promise<boolean>;
  /**
   * The greatest `occurredAt` of any event already processed for the task, or
   * null if none — the ordering signal used to drop late, out-of-order events.
   */
  maxOccurredAtForTask(taskId: MaintenanceTaskId): Promise<Date | null>;
  recordProcessed(entry: {
    eventId: string;
    maintenanceTaskId: MaintenanceTaskId;
    occurredAt: Date;
    processedAt: Date;
  }): Promise<void>;
}
