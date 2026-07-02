import type { MaintenanceTaskId } from "@snaveevans/pineapple-shared";

/**
 * Port: dedupe / order state for the inbound notification event consumer.
 * Records each processed source event by its stable id so at-least-once redelivery
 * is a no-op.
 */
export interface NotificationEventLog {
  hasProcessed(eventId: string): Promise<boolean>;
  recordProcessed(entry: {
    eventId: string;
    maintenanceTaskId: MaintenanceTaskId;
    occurredAt: Date;
    processedAt: Date;
  }): Promise<void>;
}
