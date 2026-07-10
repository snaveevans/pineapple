import { TeamId, UserId } from "@snaveevans/pineapple-shared";
import { Team, type TeamMember, type TeamRole } from "../../domain/teams/Team.ts";
import type { TeamRepository } from "../../domain/teams/TeamRepository.ts";

type TeamRow = {
  id: string;
  name: string;
  created_at: string;
};

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export class D1TeamRepository implements TeamRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: TeamId): Promise<Team | null> {
    const row = await this.db
      .prepare("SELECT id, name, created_at FROM teams WHERE id = ?")
      .bind(id)
      .first<TeamRow>();
    if (!row) return null;

    const memberRows = await this.#findMemberRows(row.id);
    return this.#rowToTeam(row, memberRows);
  }

  async findByMemberId(userId: UserId): Promise<Team | null> {
    const memberRow = await this.db
      .prepare("SELECT team_id FROM team_members WHERE user_id = ?")
      .bind(userId)
      .first<{ team_id: string }>();
    if (!memberRow) return null;

    return this.findById(TeamId.from(memberRow.team_id));
  }

  async save(team: Team): Promise<void> {
    const teamStatement = this.db
      .prepare(
        `INSERT INTO teams (id, name, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
      )
      .bind(team.id, team.name, team.createdAt.toISOString());

    const now = new Date().toISOString();
    const memberStatements = team.members.map((member) =>
      this.db
        .prepare(
          `INSERT INTO team_members (team_id, user_id, role, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (team_id, user_id) DO UPDATE SET role = excluded.role`,
        )
        .bind(team.id, member.userId, member.role, now),
    );

    await this.db.batch([teamStatement, ...memberStatements]);
  }

  async #findMemberRows(teamId: string): Promise<TeamMemberRow[]> {
    const result = await this.db
      .prepare("SELECT team_id, user_id, role, created_at FROM team_members WHERE team_id = ?")
      .bind(teamId)
      .all<TeamMemberRow>();
    return result.results;
  }

  #rowToTeam(row: TeamRow, memberRows: TeamMemberRow[]): Team {
    const members: TeamMember[] = memberRows.map((memberRow) => ({
      userId: UserId.from(memberRow.user_id),
      role: memberRow.role as TeamRole,
    }));

    return Team.reconstitute({
      id: TeamId.from(row.id),
      name: row.name,
      members,
      createdAt: new Date(row.created_at),
    });
  }
}
