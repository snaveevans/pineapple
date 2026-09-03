import { AssetId, MaintenanceTaskId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceTask } from "../../domain/maintenance/MaintenanceTask.ts";
import {
  D1MaintenanceTaskRepository,
  prepareMaintenanceTaskSave,
} from "./D1MaintenanceTaskRepository.ts";

type BoundStatement = {
  query: string;
  values: unknown[];
};

function createDatabaseHarness() {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => {
    return {
      bind: (...values: unknown[]) => {
        statements.push({ query, values });
        return {
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        };
      },
    } as unknown as D1PreparedStatement;
  });
  const batch = vi.fn((batchStatements: D1PreparedStatement[]) =>
    Promise.resolve(batchStatements.map(() => ({ meta: { changes: 1 } })) as D1Result<unknown>[]),
  );
  const db = { prepare, batch } as unknown as D1Database;

  return { db, statements, batch };
}

describe("D1MaintenanceTaskRepository", () => {
  it("findForVisibleActiveAssets joins active assets including team-shared", async () => {
    const { db, statements } = createDatabaseHarness();
    const ownerId = UserId.generate();

    await new D1MaintenanceTaskRepository(db).findForVisibleActiveAssets(ownerId);

    expect(statements).toHaveLength(1);
    const query = statements[0]?.query ?? "";
    expect(query).toContain("INNER JOIN assets a ON a.id = t.asset_id");
    expect(query).toContain("a.archived_at IS NULL");
    expect(query).toContain("shared_team_id");
    expect(statements[0]?.values).toEqual([ownerId, ownerId]);
  });

  it("prepareMaintenanceTaskSave upserts title, interval, and schedule fields on conflict", () => {
    const { db, statements } = createDatabaseHarness();
    const task = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "Replace furnace filter",
      intervalValue: 3,
      intervalUnit: "month",
      lastCompletedDate: "2026-04-11",
      nextDue: "2026-07-11",
      createdAt: new Date(),
    });

    prepareMaintenanceTaskSave(db, task);

    const query = statements[0]?.query ?? "";
    expect(query).toContain("title = excluded.title");
    expect(query).toContain("interval_value = excluded.interval_value");
    expect(query).toContain("interval_unit = excluded.interval_unit");
    expect(query).toContain("last_completed_date = excluded.last_completed_date");
    expect(query).toContain("next_due = excluded.next_due");
  });

  it("persists next_due_override through the save upsert and clears it to NULL", () => {
    const { db, statements } = createDatabaseHarness();
    const task = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-05-11",
      nextDue: "2026-09-15",
      createdAt: new Date(),
      nextDueOverride: "2026-09-15",
    });

    prepareMaintenanceTaskSave(db, task);

    const query = statements[0]?.query ?? "";
    expect(query).toContain("next_due_override");
    expect(query).toContain("next_due_override = excluded.next_due_override");
    // The override is the 13th bound column, after revision.
    expect(statements[0]?.values).toContain("2026-09-15");
    expect(statements[0]?.values).toHaveLength(13);

    const cleared = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "T",
      intervalValue: 1,
      intervalUnit: "month",
      lastCompletedDate: null,
      nextDue: "2026-07-01",
      createdAt: new Date(),
      nextDueOverride: null,
    });
    prepareMaintenanceTaskSave(db, cleared);
    expect(statements[1]?.values).toContain(null);
  });

  it("reads next_due_override back in every task SELECT", async () => {
    const { db, statements } = createDatabaseHarness();
    const repo = new D1MaintenanceTaskRepository(db);

    await repo.findById(MaintenanceTaskId.generate());
    expect(statements[0]?.query).toContain("next_due_override");

    await repo.findForVisibleActiveAssets(UserId.generate());
    expect(statements[1]?.query).toContain("t.next_due_override");

    await repo.findByAsset(AssetId.generate());
    expect(statements[2]?.query).toContain("next_due_override");
  });

  it("updateWithRevision writes next_due_override and guards on the expected revision", async () => {
    const { db, statements, batch } = createDatabaseHarness();
    const repo = new D1MaintenanceTaskRepository(db);
    const task = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "Replace furnace filter",
      intervalValue: 2,
      intervalUnit: "month",
      lastCompletedDate: "2026-05-11",
      nextDue: "2026-09-15",
      createdAt: new Date(),
      revision: 3,
      nextDueOverride: "2026-09-15",
    });

    const success = await repo.updateWithRevision(task, 2, []);

    expect(success).toBe(true);
    expect(batch).toHaveBeenCalledTimes(1);
    const update = statements.find(
      (s) => s.query.includes("UPDATE maintenance_tasks") && s.query.includes("SET title = ?"),
    );
    expect(update).toBeDefined();
    expect(update?.query).toContain("next_due_override = ?");
    expect(update?.query).toContain("WHERE id = ? AND revision = ?");
    expect(update?.values).toContain("2026-09-15");
    expect(update?.values).toContain(3); // resulting revision
    expect(update?.values).toContain(2); // expected revision guard
  });

  it("updateWithRevision returns false when the conditional update matches no row", async () => {
    const prepare = vi.fn(() => ({ bind: () => ({}) }) as unknown as D1PreparedStatement);
    const batch = vi.fn(() => Promise.resolve([{ meta: { changes: 0 } } as D1Result<unknown>]));
    const failingDb = { prepare, batch } as unknown as D1Database;
    const repo = new D1MaintenanceTaskRepository(failingDb);
    const task = MaintenanceTask.reconstitute({
      id: MaintenanceTaskId.generate(),
      assetId: AssetId.generate(),
      ownerId: UserId.generate(),
      title: "T",
      intervalValue: 1,
      intervalUnit: "month",
      lastCompletedDate: null,
      nextDue: "2026-07-01",
      createdAt: new Date(),
    });

    const success = await repo.updateWithRevision(task, 1, []);

    expect(success).toBe(false);
  });
});
