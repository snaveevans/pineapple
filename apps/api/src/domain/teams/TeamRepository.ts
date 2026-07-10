import type { TeamId, UserId } from "@snaveevans/pineapple-shared";
import type { Team } from "./Team.ts";

export interface TeamRepository {
  findById(id: TeamId): Promise<Team | null>;
  findByMemberId(userId: UserId): Promise<Team | null>;
  save(team: Team): Promise<void>;
}
