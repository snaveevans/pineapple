import {
  type DomainError,
  DomainError as DomainErrorClass,
  ConflictError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import { Team } from "../../domain/teams/Team.ts";
import type { TeamRepository } from "../../domain/teams/TeamRepository.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { buildTeamReadModel, type TeamWithMembers } from "../teams/TeamReadModel.ts";

export type CreateTeamCommand = {
  requesterId: UserId;
  name: string;
};

export class CreateTeam {
  constructor(
    private readonly teams: TeamRepository,
    private readonly users: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: CreateTeamCommand): Promise<Result<TeamWithMembers, DomainError>> {
    try {
      const existing = await this.teams.findByMemberId(cmd.requesterId);
      if (existing) {
        return err(new ConflictError("You already belong to a team"));
      }

      const team = Team.create({ ownerId: cmd.requesterId, name: cmd.name });
      const events = team.pullEvents();
      await this.teams.save(team);
      await this.eventBus.publishAll(events);

      return ok(await buildTeamReadModel(team, this.users));
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
