import { apiGet, apiPost } from "./client.ts";
import type { components } from "./schema.ts";

export type TeamMember = components["schemas"]["TeamMember"];
export type Team = components["schemas"]["Team"];
export type MyTeam = components["schemas"]["MyTeam"];

export const teamQueryKey = ["team"] as const;

export function getMyTeam(): Promise<MyTeam> {
  return apiGet("/api/teams/me");
}

export function createTeam(name: string): Promise<Team> {
  return apiPost("/api/teams", { body: { name } });
}
