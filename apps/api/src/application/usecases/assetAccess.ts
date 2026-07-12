import type { UserId } from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";

/**
 * Whether the requester can see/edit the asset: they own it, or they belong
 * to the team it is shared with. Access to dependent records follows the asset.
 */
export async function canAccessAsset(
  asset: Asset,
  requesterId: UserId,
  teams: TeamRepository,
): Promise<boolean> {
  if (asset.ownerId === requesterId) return true;
  if (asset.sharedTeamId === null) return false;
  const team = await teams.findByMember(requesterId);
  return team !== null && team.id === asset.sharedTeamId;
}
