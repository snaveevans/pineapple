import type { ActivityActorSnapshot } from "../api/activity";

/**
 * Attribution label for an activity entry actor.
 * "You" when the actor is the viewer; otherwise the snapshotted display name.
 */
export function activityActorLabel(actor: ActivityActorSnapshot, viewerUserId: string): string {
  if (actor.id === viewerUserId) return "You";
  const name = actor.displayName.trim();
  return name.length > 0 ? name : "Unknown";
}
