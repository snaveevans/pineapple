import {
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { toTeamReadModel, type TeamReadModel } from "./teamReadModel.ts";

export type GetMyTeamQuery = {
  userId: UserId;
};

export type MyTeamReadModel = {
  team: TeamReadModel | null;
};

export class GetMyTeam {
  constructor(
    private readonly teams: TeamRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(query: GetMyTeamQuery): Promise<Result<MyTeamReadModel, DomainError>> {
    try {
      const team = await this.teams.findByMember(query.userId);
      if (!team) return ok({ team: null });

      const memberNames = new Map<string, string>();
      for (const member of team.members) {
        const user = await this.users.findById(member.userId);
        if (user) {
          memberNames.set(member.userId, user.name ?? "Unknown");
        }
      }

      return ok({ team: toTeamReadModel(team, memberNames) });
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
