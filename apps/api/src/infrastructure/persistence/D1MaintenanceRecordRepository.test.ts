import {
  AssetId,
  MaintenanceRecordId,
  MaintenanceTaskId,
  UserId,
} from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceRecord } from "../../domain/maintenance/MaintenanceRecord.ts";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import { D1MaintenanceRecordRepository } from "./D1MaintenanceRecordRepository.ts";

type BoundStatement = {
  query: string;
  values: unknown[];
  run: ReturnType<typeof vi.fn>;
  statement: D1PreparedStatement;
};

function createDatabaseHarness() {
  const statements: BoundStatement[] = [];
  const batch = vi.fn().mockResolvedValue([]);
  const prepare = vi.fn((query: string) => {
    return {
      bind: (...values: unknown[]) => {
        const run = vi.fn().mockResolvedValue({ success: true });
        const statement = { run } as unknown as D1PreparedStatement;
        statements.push({ query, values, run, statement });
        return statement;
      },
    } as unknown as D1PreparedStatement;
  });
  const db = { prepare, batch } as unknown as D1Database;

  return { db, batch, statements };
}

function createEntities() {
  const assetId = AssetId.generate();
  const ownerId = UserId.generate();
  const taskId = MaintenanceTaskId.generate();
  const createdAt = new Date("2026-06-09T12:00:00.000Z");
  const record = MaintenanceRecord.reconstitute({
    id: MaintenanceRecordId.generate(),
    assetId,
    ownerId,
    title: "Replaced furnace filter",
    performedAt: "2026-06-09",
    notes: null,
    taskId,
    createdAt,
  });
  const task = MaintenanceTask.reconstitute({
    id: taskId,
    assetId,
    ownerId,
    title: "Replace furnace filter",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-06-09",
    nextDue: "2026-08-09",
    createdAt,
  });

  return { record, task };
}

describe("D1MaintenanceRecordRepository", () => {
  it("batches the record insert and advanced task update", async () => {
    const { db, batch, statements } = createDatabaseHarness();
    const { record, task } = createEntities();

    await new D1MaintenanceRecordRepository(db).save(record, task);

    expect(batch).toHaveBeenCalledOnce();
    expect(batch).toHaveBeenCalledWith(statements.map(({ statement }) => statement));
    expect(statements).toHaveLength(2);
    expect(statements[0]?.query).toContain("INSERT INTO maintenance_records");
    expect(statements[1]?.query).toContain("INSERT INTO maintenance_tasks");
    expect(statements.every(({ run }) => run.mock.calls.length === 0)).toBe(true);
  });

  it("runs only the record insert when no task advanced", async () => {
    const { db, batch, statements } = createDatabaseHarness();
    const { record } = createEntities();

    await new D1MaintenanceRecordRepository(db).save(record);

    expect(batch).not.toHaveBeenCalled();
    expect(statements).toHaveLength(1);
    expect(statements[0]?.run).toHaveBeenCalledOnce();
  });
});
