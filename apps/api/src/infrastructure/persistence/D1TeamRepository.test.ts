import { TeamId, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it, vi } from "vitest";
import { Team } from "../../domain/teams/Team.ts";
import { D1TeamRepository } from "./D1TeamRepository.ts";

type BoundStatement = {
  query: string;
  values: unknown[];
};

function createDatabaseHarness(
  options: {
    teamRow?: { id: string; name: string; created_at: string } | null;
    memberRows?: { team_id: string; user_id: string; role: string; created_at: string }[];
  } = {},
) {
  const statements: BoundStatement[] = [];
  const batchedStatements: D1PreparedStatement[][] = [];

  const prepare = vi.fn((query: string) => {
    return {
      bind: (...values: unknown[]) => {
        statements.push({ query, values });
        return {
          first: vi
            .fn()
            .mockResolvedValue(
              query.includes("FROM teams WHERE id")
                ? (options.teamRow ?? null)
                : query.includes("SELECT team_id FROM team_members")
                  ? options.teamRow
                    ? { team_id: options.teamRow.id }
                    : null
                  : null,
            ),
          all: vi.fn().mockResolvedValue({ results: options.memberRows ?? [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      },
    } as unknown as D1PreparedStatement;
  });

  const batch = vi.fn((stmts: D1PreparedStatement[]) => {
    batchedStatements.push(stmts);
    return Promise.resolve(stmts.map(() => ({ success: true })));
  });

  const db = { prepare, batch } as unknown as D1Database;

  return { db, statements, batchedStatements };
}

describe("D1TeamRepository", () => {
  it("findById returns null when no team row exists", async () => {
    const { db } = createDatabaseHarness();

    const team = await new D1TeamRepository(db).findById(TeamId.generate());

    expect(team).toBeNull();
  });

  it("findById reconstitutes a team with its members", async () => {
    const teamId = TeamId.generate();
    const ownerId = UserId.generate();
    const { db } = createDatabaseHarness({
      teamRow: { id: teamId, name: "The Smiths", created_at: "2026-01-01T00:00:00.000Z" },
      memberRows: [
        {
          team_id: teamId,
          user_id: ownerId,
          role: "owner",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const team = await new D1TeamRepository(db).findById(teamId);

    expect(team?.name).toBe("The Smiths");
    expect(team?.ownerId).toBe(ownerId);
    expect(team?.members).toEqual([{ userId: ownerId, role: "owner" }]);
  });

  it("findByMemberId returns null when the user belongs to no team", async () => {
    const { db, statements } = createDatabaseHarness();

    const team = await new D1TeamRepository(db).findByMemberId(UserId.generate());

    expect(team).toBeNull();
    expect(statements[0]?.query).toContain("SELECT team_id FROM team_members WHERE user_id = ?");
  });

  it("findByMemberId resolves through the membership row to the full team", async () => {
    const teamId = TeamId.generate();
    const ownerId = UserId.generate();
    const { db } = createDatabaseHarness({
      teamRow: { id: teamId, name: "The Smiths", created_at: "2026-01-01T00:00:00.000Z" },
      memberRows: [
        {
          team_id: teamId,
          user_id: ownerId,
          role: "owner",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const team = await new D1TeamRepository(db).findByMemberId(ownerId);

    expect(team?.id).toBe(teamId);
    expect(team?.name).toBe("The Smiths");
  });

  it("save batches a team upsert with one team_members upsert per member", async () => {
    const { db, batchedStatements, statements } = createDatabaseHarness();
    const ownerId = UserId.generate();
    const team = Team.create({ ownerId, name: "The Smiths" });
    team.pullEvents(); // drain

    await new D1TeamRepository(db).save(team);

    expect(batchedStatements).toHaveLength(1);
    expect(batchedStatements[0]).toHaveLength(2);
    expect(statements[0]?.query).toContain("INSERT INTO teams");
    expect(statements[0]?.values).toEqual([team.id, "The Smiths", team.createdAt.toISOString()]);
    expect(statements[1]?.query).toContain("INSERT INTO team_members");
    expect(statements[1]?.values).toEqual([team.id, ownerId, "owner", expect.any(String)]);
  });
});
