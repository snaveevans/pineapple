import type { TeamId, UserId } from "@snaveevans/pineapple-shared";
import type { Team, TeamRole } from "../../domain/teams/Team.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";

export type TeamMemberReadModel = {
  userId: UserId;
  name: string | null;
  role: TeamRole;
};

export type TeamWithMembers = {
  id: TeamId;
  name: string;
  ownerId: UserId;
  members: TeamMemberReadModel[];
  createdAt: Date;
};

export async function buildTeamReadModel(
  team: Team,
  users: UserRepository,
): Promise<TeamWithMembers> {
  const members = await Promise.all(
    team.members.map(async (member): Promise<TeamMemberReadModel> => {
      const user = await users.findById(member.userId);
      return { userId: member.userId, name: user?.name ?? null, role: member.role };
    }),
  );

  return {
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    members,
    createdAt: team.createdAt,
  };
}
