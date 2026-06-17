import { UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { D1MaintenanceTaskRepository } from "./D1MaintenanceTaskRepository.ts";

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
  it("findByOwnerForActiveAssets joins active assets and excludes archived rows", async () => {
    const { db, statements } = createDatabaseHarness();
    const ownerId = UserId.generate();

    await new D1MaintenanceTaskRepository(db).findByOwnerForActiveAssets(ownerId);

    expect(statements).toHaveLength(1);
    const query = statements[0]?.query ?? "";
    expect(query).toContain("INNER JOIN assets a ON a.id = t.asset_id");
    expect(query).toContain("a.archived_at IS NULL");
    expect(statements[0]?.values).toEqual([ownerId]);
  });
});
