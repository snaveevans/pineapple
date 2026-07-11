import { ConflictError, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { Team } from "../../domain/team/Team.ts";
import { D1TeamRepository } from "./D1TeamRepository.ts";

type BoundStatement = {
  query: string;
  values: unknown[];
};

function createDatabaseHarness(
  options: {
    firstResult?: unknown;
    batchError?: Error;
  } = {},
) {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((query: string) => {
    return {
      bind: (...values: unknown[]) => {
        statements.push({ query, values });
        return {
          first: vi.fn().mockResolvedValue(options.firstResult ?? null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      },
    } as unknown as D1PreparedStatement;
  });
  const batch = options.batchError
    ? vi.fn().mockRejectedValue(options.batchError)
    : vi.fn().mockResolvedValue([]);
  const db = { prepare, batch } as unknown as D1Database;

  return { db, statements, batch };
}

describe("D1TeamRepository", () => {
  it("upserts members on the natural key (team_id, user_id), not a random id", async () => {
    const { db, statements } = createDatabaseHarness();
    const ownerId = UserId.generate();
    const team = Team.create({ ownerId, name: "Field Ops" });

    await new D1TeamRepository(db).save(team);

    const memberStmt = statements.find((s) => s.query.includes("team_members"));
    expect(memberStmt).toBeDefined();
    expect(memberStmt?.query).toContain("ON CONFLICT (team_id, user_id)");
    expect(memberStmt?.query).not.toMatch(/ON CONFLICT \(id\)/);
  });

  it("maps UNIQUE constraint violations to ConflictError", async () => {
    const { db } = createDatabaseHarness({
      batchError: new Error("D1_ERROR: UNIQUE constraint failed: team_members.user_id"),
    });
    const ownerId = UserId.generate();
    const team = Team.create({ ownerId, name: "Field Ops" });

    await expect(new D1TeamRepository(db).save(team)).rejects.toBeInstanceOf(ConflictError);
    await expect(new D1TeamRepository(db).save(team)).rejects.toThrow(
      "User already belongs to a team",
    );
  });

  it("re-throws non-constraint errors", async () => {
    const { db } = createDatabaseHarness({
      batchError: new Error("connection reset"),
    });
    const ownerId = UserId.generate();
    const team = Team.create({ ownerId, name: "Field Ops" });

    await expect(new D1TeamRepository(db).save(team)).rejects.toThrow("connection reset");
  });

  it("does not write activity outbox rows for team events", async () => {
    const { db, statements } = createDatabaseHarness();
    const ownerId = UserId.generate();
    const team = Team.create({ ownerId, name: "Field Ops" });
    const events = team.pullEvents();

    await new D1TeamRepository(db).save(team, events);

    expect(statements.every((s) => !s.query.includes("activity_event_outbox"))).toBe(true);
  });
});
