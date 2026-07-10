import {
  type DomainError,
  DomainError as DomainErrorClass,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { TeamRepository } from "../../domain/teams/TeamRepository.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { buildTeamReadModel, type TeamWithMembers } from "../teams/TeamReadModel.ts";

export type GetMyTeamQuery = {
  requesterId: UserId;
};

export type MyTeamReadModel = {
  team: TeamWithMembers | null;
};

export class GetMyTeam {
  constructor(
    private readonly teams: TeamRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(query: GetMyTeamQuery): Promise<Result<MyTeamReadModel, DomainError>> {
    try {
      const team = await this.teams.findByMemberId(query.requesterId);
      if (!team) return ok({ team: null });

      return ok({ team: await buildTeamReadModel(team, this.users) });
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
