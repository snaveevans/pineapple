import type { AssetSharing } from "../api/assets";

/**
 * Display-only sharing badge copy driven by the API `sharing` descriptor
 * (ADR-0009). Personal assets produce no badge.
 */
export type SharingBadge =
  | { kind: "shared-with-team"; text: "Shared with team" }
  | { kind: "shared-by"; text: string }
  | null;

export function sharingBadge(sharing: AssetSharing): SharingBadge {
  if (sharing.scope !== "team") return null;
  if (sharing.isOwner) {
    return { kind: "shared-with-team", text: "Shared with team" };
  }
  const owner = sharing.ownerDisplayName?.trim();
  return {
    kind: "shared-by",
    text: `Shared by ${owner && owner.length > 0 ? owner : "a teammate"}`,
  };
}
