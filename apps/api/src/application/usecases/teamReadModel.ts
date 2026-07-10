import type { Team } from "../../domain/team/Team.ts";
import type { TeamRole } from "../../domain/team/Membership.ts";

export type TeamMemberReadModel = {
  userId: string;
  name: string;
  role: TeamRole;
};

export type TeamReadModel = {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMemberReadModel[];
  createdAt: string;
};

export function toTeamReadModel(team: Team, memberNames: Map<string, string>): TeamReadModel {
  return {
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    createdAt: team.createdAt.toISOString(),
    members: team.members.map((m) => ({
      userId: m.userId,
      name: memberNames.get(m.userId) ?? "Unknown",
      role: m.role,
    })),
  };
}
