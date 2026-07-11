import type { TeamId, UserId } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../events/DomainEvent.ts";
import type { Team } from "./Team.ts";

export interface TeamRepository {
  findByMember(userId: UserId): Promise<Team | null>;
  findById(id: TeamId): Promise<Team | null>;
  save(team: Team, events?: readonly DomainEvent[]): Promise<void>;
}
