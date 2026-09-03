import {
  AssetId,
  EmailBatchId,
  MaintenanceTaskId,
  NotificationId,
  ScheduledReminderId,
  UserId,
} from "@snaveevans/pineapple-shared";
import type { AssetType } from "../../domain/asset/AssetType.ts";
import type { EmailBatchRecord } from "../../application/ports/EmailBatchRepository.ts";
import type { NotificationRecord } from "../../application/ports/NotificationRepository.ts";
import type {
  ReminderSweepPersistenceInput,
  ReminderSweepPersistenceResult,
  ReminderSweepStore,
} from "../../application/ports/ReminderSweepStore.ts";
import type { ScheduledReminderRecord } from "../../application/ports/ScheduledReminderRepository.ts";
import type {
  EmailBatchStatus,
  EmailSuppressReason,
  ScheduledReminderStatus,
} from "../../application/notifications/notificationTypes.ts";
import { createReminderEmailMessage } from "../notifications/ReminderEmailMessage.ts";

type ScheduledReminderRow = {
  id: string;
  owner_id: string;
  actor_id: string;
  maintenance_task_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  task_title: string;
  next_due: string;
  fire_at: string;
  snoozed_until: string | null;
  status: string;
  last_event_id: string;
  last_event_occurred_at: string;
  created_at: string;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  owner_id: string;
  actor_id: string;
  type: string;
  maintenance_task_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  task_title: string;
  next_due: string;
  created_at: string;
  read_at: string | null;
};

type ExistingNotificationKey = {
  maintenance_task_id: string;
  next_due: string;
};

type EmailBatchRow = {
  id: string;
  owner_id: string;
  status: string;
  suppress_reason: string | null;
  notification_count: number;
  created_at: string;
  updated_at: string;
};

const REMINDER_COLUMNS =
  "id, owner_id, actor_id, maintenance_task_id, asset_id, asset_name, asset_type, task_title, next_due, fire_at, snoozed_until, status, last_event_id, last_event_occurred_at, created_at, updated_at";
const NOTIFICATION_COLUMNS =
  "id, owner_id, actor_id, type, maintenance_task_id, asset_id, asset_name, asset_type, task_title, next_due, created_at, read_at";
const EMAIL_BATCH_COLUMNS =
  "id, owner_id, status, suppress_reason, notification_count, created_at, updated_at";

export class D1ReminderSweepStore implements ReminderSweepStore {
  constructor(private readonly db: D1Database) {}

  async findDue(today: string): Promise<ScheduledReminderRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${REMINDER_COLUMNS} FROM scheduled_reminders
         WHERE status = 'pending' AND fire_at <= ?
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY owner_id, id`,
      )
      .bind(today, today)
      .all<ScheduledReminderRow>();
    return (result.results ?? []).map(reminderFromRow);
  }

  async recordDueReminderSweep(
    input: ReminderSweepPersistenceInput,
  ): Promise<ReminderSweepPersistenceResult> {
    if (input.candidates.length === 0) {
      return { createdNotifications: [], reactivatedCount: 0, emailBatches: [] };
    }

    const statements: D1PreparedStatement[] = [];
    const updatedAt = input.updatedAt.toISOString();

    // See pre-upsert state within the same transaction so a re-fired cycle's
    // re-activated row can be told apart from a genuinely created one: only
    // created rows publish their MaintenanceReminderCreated event.
    for (const candidate of input.candidates) {
      statements.push(
        this.db
          .prepare(
            `SELECT maintenance_task_id, next_due FROM notifications
             WHERE maintenance_task_id = ? AND next_due = ?`,
          )
          .bind(candidate.notification.maintenanceTaskId, candidate.notification.nextDue),
      );
    }

    for (const candidate of input.candidates) {
      const notification = candidate.notification;
      statements.push(
        this.db
          .prepare(
            `INSERT INTO notifications (${NOTIFICATION_COLUMNS}, email_batch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (maintenance_task_id, next_due) DO UPDATE SET
               read_at = NULL,
               created_at = excluded.created_at,
               email_batch_id = excluded.email_batch_id`,
          )
          .bind(
            notification.id,
            notification.ownerId,
            notification.actorId,
            notification.type,
            notification.maintenanceTaskId,
            notification.assetId,
            notification.assetName,
            notification.assetType,
            notification.taskTitle,
            notification.nextDue,
            notification.createdAt.toISOString(),
            notification.readAt?.toISOString() ?? null,
            candidate.emailBatchId,
          ),
      );
      statements.push(
        this.db
          .prepare(
            `UPDATE scheduled_reminders
             SET status = 'fired', snoozed_until = NULL, updated_at = ? WHERE id = ?`,
          )
          .bind(updatedAt, candidate.reminderId),
      );
    }

    for (const batch of input.emailBatches) {
      const message = createReminderEmailMessage({
        batchId: batch.id,
        ownerId: batch.ownerId,
        occurredAt: input.updatedAt,
      });
      statements.push(
        this.db
          .prepare(
            `INSERT INTO email_batches (${EMAIL_BATCH_COLUMNS})
             SELECT ?, ?, 'pending', NULL,
                    (SELECT COUNT(*) FROM notifications WHERE email_batch_id = ?),
                    ?, ?
             WHERE EXISTS (SELECT 1 FROM notifications WHERE email_batch_id = ?)`,
          )
          .bind(
            batch.id,
            batch.ownerId,
            batch.id,
            batch.createdAt.toISOString(),
            updatedAt,
            batch.id,
          ),
      );
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO notification_email_outbox
               (id, batch_id, owner_id, payload, status, attempts, created_at, updated_at)
             SELECT ?, ?, ?, ?, 'pending', 0, ?, ?
             WHERE EXISTS (SELECT 1 FROM email_batches WHERE id = ?)`,
          )
          .bind(
            batch.id,
            batch.id,
            batch.ownerId,
            JSON.stringify(message),
            batch.createdAt.toISOString(),
            updatedAt,
            batch.id,
          ),
      );
    }

    const batchResults = await this.db.batch(statements);

    const preExisting = new Set(
      batchResults
        .slice(0, input.candidates.length)
        .flatMap((result) => (result.results ?? []) as ExistingNotificationKey[])
        .map((row) => notificationKey(row.maintenance_task_id, row.next_due)),
    );

    const batchIds = input.emailBatches.map((batch) => batch.id);
    const persistedNotifications = sortNotificationsByCandidateOrder(
      await this.findNotificationsByBatchIds(batchIds),
      input,
    );
    const createdNotifications = persistedNotifications.filter(
      (notification) =>
        !preExisting.has(notificationKey(notification.maintenanceTaskId, notification.nextDue)),
    );

    return {
      createdNotifications,
      reactivatedCount: persistedNotifications.length - createdNotifications.length,
      emailBatches: await this.findEmailBatchesByIds(batchIds),
    };
  }

  private async findNotificationsByBatchIds(
    batchIds: EmailBatchId[],
  ): Promise<NotificationRecord[]> {
    if (batchIds.length === 0) return [];
    const result = await this.db
      .prepare(
        `SELECT ${NOTIFICATION_COLUMNS} FROM notifications
         WHERE email_batch_id IN (${placeholders(batchIds.length)})`,
      )
      .bind(...batchIds)
      .all<NotificationRow>();
    return (result.results ?? []).map(notificationFromRow);
  }

  private async findEmailBatchesByIds(batchIds: EmailBatchId[]): Promise<EmailBatchRecord[]> {
    if (batchIds.length === 0) return [];
    const result = await this.db
      .prepare(
        `SELECT ${EMAIL_BATCH_COLUMNS} FROM email_batches
         WHERE id IN (${placeholders(batchIds.length)})
         ORDER BY created_at ASC, id ASC`,
      )
      .bind(...batchIds)
      .all<EmailBatchRow>();
    return (result.results ?? []).map(emailBatchFromRow);
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function notificationKey(taskId: string, nextDue: string): string {
  return `${taskId}\u0000${nextDue}`;
}

function sortNotificationsByCandidateOrder(
  notifications: NotificationRecord[],
  input: ReminderSweepPersistenceInput,
): NotificationRecord[] {
  const order = new Map(
    input.candidates.map((candidate, index) => [candidate.notification.id, index]),
  );
  return notifications.sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
}

function reminderFromRow(row: ScheduledReminderRow): ScheduledReminderRecord {
  return {
    id: ScheduledReminderId.from(row.id),
    ownerId: UserId.from(row.owner_id),
    actorId: row.actor_id,
    maintenanceTaskId: MaintenanceTaskId.from(row.maintenance_task_id),
    assetId: AssetId.from(row.asset_id),
    assetName: row.asset_name,
    assetType: row.asset_type as AssetType,
    taskTitle: row.task_title,
    nextDue: row.next_due,
    fireAt: row.fire_at,
    snoozedUntil: row.snoozed_until,
    status: row.status as ScheduledReminderStatus,
    lastEventId: row.last_event_id,
    lastEventOccurredAt: new Date(row.last_event_occurred_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function notificationFromRow(row: NotificationRow): NotificationRecord {
  return {
    id: NotificationId.from(row.id),
    ownerId: UserId.from(row.owner_id),
    actorId: row.actor_id,
    type: "maintenance_due_soon",
    maintenanceTaskId: MaintenanceTaskId.from(row.maintenance_task_id),
    assetId: AssetId.from(row.asset_id),
    assetName: row.asset_name,
    assetType: row.asset_type as AssetType,
    taskTitle: row.task_title,
    nextDue: row.next_due,
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : null,
  };
}

function emailBatchFromRow(row: EmailBatchRow): EmailBatchRecord {
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
