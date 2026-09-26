import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { prepareActivityOutboxInsert } from "../activity/D1ActivityOutboxRepository.ts";
import { prepareNotificationOutboxInsert } from "../notifications/D1NotificationOutboxRepository.ts";

/** Prepare all durable outbox statements emitted by a maintenance mutation. */
export function prepareMaintenanceOutboxInserts(
  db: D1Database,
  events: readonly DomainEvent[],
): D1PreparedStatement[] {
  return events
    .flatMap((event) => [
      prepareActivityOutboxInsert(db, event),
      prepareNotificationOutboxInsert(db, event),
    ])
    .filter((statement): statement is D1PreparedStatement => statement !== null);
}
