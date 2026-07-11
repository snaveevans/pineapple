import { TeamId, UserId, ConflictError } from "@snaveevans/pineapple-shared";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { createMembership, type Membership } from "../../domain/team/Membership.ts";
import { prepareActivityOutboxInsert } from "../activity/D1ActivityOutboxRepository.ts";

type TeamRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export class D1TeamRepository implements TeamRepository {
  constructor(private readonly db: D1Database) {}

  async findByMember(userId: UserId): Promise<Team | null> {
    const teamRow = await this.db
      .prepare(
        `SELECT t.id, t.owner_id, t.name, t.created_at
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
         WHERE tm.user_id = ?`,
      )
      .bind(userId)
      .first<TeamRow>();

    if (!teamRow) return null;
    return this.#loadMembers(teamRow);
  }

  async findById(id: TeamId): Promise<Team | null> {
    const teamRow = await this.db
      .prepare("SELECT id, owner_id, name, created_at FROM teams WHERE id = ?")
      .bind(id)
      .first<TeamRow>();

    if (!teamRow) return null;
    return this.#loadMembers(teamRow);
  }

  async save(
    team: Team,
    events: readonly import("../../domain/events/DomainEvent.ts").DomainEvent[] = [],
  ): Promise<void> {
    const teamStatement = this.db
      .prepare(
        `INSERT INTO teams (id, owner_id, name, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name`,
      )
      .bind(team.id, team.ownerId, team.name, team.createdAt.toISOString());

    const memberStatements = team.members.map((m) =>
      this.db
        .prepare(
          `INSERT INTO team_members (id, team_id, user_id, role, joined_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (team_id, user_id) DO UPDATE SET
             role = excluded.role,
             joined_at = excluded.joined_at`,
        )
        .bind(crypto.randomUUID(), team.id, m.userId, m.role, m.joinedAt.toISOString()),
    );

    const outboxStatements = events
      .map((event) => prepareActivityOutboxInsert(this.db, event))
      .filter((statement): statement is D1PreparedStatement => statement !== null);

    try {
      await this.db.batch([teamStatement, ...memberStatements, ...outboxStatements]);
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint/i.test(e.message)) {
        throw new ConflictError("User already belongs to a team");
      }
      throw e;
    }
  }

  async #loadMembers(teamRow: TeamRow): Promise<Team> {
    const memberResult = await this.db
      .prepare("SELECT id, team_id, user_id, role, joined_at FROM team_members WHERE team_id = ?")
      .bind(teamRow.id)
      .all<TeamMemberRow>();

    const members: Membership[] = memberResult.results.map((row) =>
      createMembership({
        userId: UserId.from(row.user_id),
        role: row.role as "owner" | "member",
        joinedAt: new Date(row.joined_at),
      }),
    );

    return Team.reconstitute({
      id: TeamId.from(teamRow.id),
      ownerId: UserId.from(teamRow.owner_id),
      name: teamRow.name,
      createdAt: new Date(teamRow.created_at),
      members,
    });
  }
}
