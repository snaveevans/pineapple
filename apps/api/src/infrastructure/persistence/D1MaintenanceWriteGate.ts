import type { MaintenanceWriteGate } from "../../application/ports/MaintenanceWriteGate.ts";

export class D1MaintenanceWriteGate implements MaintenanceWriteGate {
  constructor(private readonly db: D1Database) {}

  async isWritable(): Promise<boolean> {
    try {
      const row = await this.db
        .prepare("SELECT mode FROM maintenance_write_gate WHERE id = 1")
        .first<{ mode: string }>();
      return row?.mode === "open";
    } catch (error) {
      // Fail closed when write gate cannot be checked (e.g. table unmigrated or DB outage),
      // but log the error so database issues are immediately observable in server logs.
      console.error("Failed to query maintenance_write_gate; failing closed as frozen:", error);
      return false;
    }
  }
}
