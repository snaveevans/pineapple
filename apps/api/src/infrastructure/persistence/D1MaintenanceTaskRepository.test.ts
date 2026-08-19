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
        };
      },
    } as unknown as D1PreparedStatement;
  });
  const db = { prepare } as unknown as D1Database;

  return { db, statements };
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
});
