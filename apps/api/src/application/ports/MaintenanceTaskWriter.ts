import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";

export interface MaintenanceTaskWriter {
  /**
   * Persists the task and its outbox rows atomically, conditionally on the
   * task still sitting at `expectedTaskRevision` (optimistic CAS). Returns
   * false on conflict so the caller can retry against fresh state.
   */
  updateWithRevision(
    task: MaintenanceTask,
    expectedTaskRevision: number,
    events?: readonly DomainEvent[],
  ): Promise<boolean>;
}
