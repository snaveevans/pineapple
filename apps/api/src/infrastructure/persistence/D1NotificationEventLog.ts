import type { MaintenanceTaskId } from "@snaveevans/pineapple-shared";
import type { NotificationEventLog } from "../../application/ports/NotificationEventLog.ts";

export class D1NotificationEventLog implements NotificationEventLog {
  constructor(private readonly db: D1Database) {}

  async hasProcessed(eventId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT 1 AS present FROM notification_ingested_events WHERE event_id = ?`)
      .bind(eventId)
      .first<{ present: number }>();
    return row !== null;
  }

  async recordProcessed(entry: {
    eventId: string;
    maintenanceTaskId: MaintenanceTaskId;
    occurredAt: Date;
    processedAt: Date;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO notification_ingested_events (event_id, maintenance_task_id, occurred_at, processed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (event_id) DO NOTHING`,
      )
      .bind(
        entry.eventId,
        entry.maintenanceTaskId,
        entry.occurredAt.toISOString(),
        entry.processedAt.toISOString(),
      )
      .run();
  }
}
