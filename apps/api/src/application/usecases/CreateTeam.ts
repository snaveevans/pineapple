import {
  type DomainError,
  DomainError as DomainErrorClass,
  ConflictError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { toTeamReadModel, type TeamReadModel } from "./teamReadModel.ts";

export type CreateTeamCommand = {
  ownerId: UserId;
  name: string;
};

export class CreateTeam {
  constructor(
    private readonly teams: TeamRepository,
    private readonly users: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: CreateTeamCommand): Promise<Result<TeamReadModel, DomainError>> {
    try {
      const existing = await this.teams.findByMember(cmd.ownerId);
      if (existing) return err(new ConflictError("User already belongs to a team"));

      const team = Team.create({ ownerId: cmd.ownerId, name: cmd.name });
      const events = team.pullEvents();
      await this.teams.save(team, events);
      await this.eventBus.publishAll(events);

      const owner = await this.users.findByIds([cmd.ownerId]);
      const memberNames = new Map<string, string>();
      if (owner.length > 0) {
        memberNames.set(cmd.ownerId, owner[0]!.name ?? "Unknown");
      }

      return ok(toTeamReadModel(team, memberNames));
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
