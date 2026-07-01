import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import type { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import type { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";

export interface MaintenanceRecordWriter {
  /** Persists the record and an advanced task atomically when both are provided. */
  save(
    record: MaintenanceRecord,
    advancedTask: MaintenanceTask | null,
    events?: readonly DomainEvent[],
  ): Promise<void>;
}
