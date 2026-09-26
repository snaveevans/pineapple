import { UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { Asset } from "../../domain/asset/Asset.ts";
import { D1AssetRepository } from "./D1AssetRepository.ts";

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
          run: vi.fn().mockResolvedValue(undefined),
        };
      },
    } as unknown as D1PreparedStatement;
  });
  const db = { prepare } as unknown as D1Database;

  return { db, statements };
}

describe("D1AssetRepository", () => {
  it("reads a missing legacy revision as zero and advances revisions on upsert", async () => {
    const { db, statements } = createDatabaseHarness();
    const repository = new D1AssetRepository(db);
    const ownerId = UserId.generate();
    const asset = Asset.create({
      ownerId,
      name: "Generator",
      metadata: { kind: "equipment", manufacturer: "Honda" },
    });

    await repository.findById(asset.id);
    expect(statements[0]?.query).toContain("COALESCE(revision, 0) AS revision");

    await repository.save(asset);
    expect(statements[1]?.query).toContain("INSERT INTO assets");
    expect(statements[1]?.query).toContain("shared_team_id, revision)");
    expect(statements[1]?.query).toContain("revision       = COALESCE(assets.revision, 0) + 1");
    expect(statements[1]?.query).toContain("WHERE assets.name IS NOT excluded.name");
    expect(statements[1]?.values.at(-1)).toBe(0);
  });

  it("findVisibleTo includes owned assets and team-shared assets via membership subquery", async () => {
    const { db, statements } = createDatabaseHarness();
    const userId = UserId.generate();

    await new D1AssetRepository(db).findVisibleTo(userId);

    expect(statements).toHaveLength(1);
    const query = statements[0]?.query ?? "";
    expect(query).toContain("owner_id = ?");
    expect(query).toContain("shared_team_id IN");
    expect(query).toContain("SELECT team_id FROM team_members WHERE user_id = ?");
    expect(statements[0]?.values).toEqual([userId, userId]);
  });
});
