import { apiRequest } from "./client";

export type TeamMember = {
  userId: string;
  name: string;
  role: "owner" | "member";
};

export type Team = {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  createdAt: string;
};

export type MyTeam = {
  team: Team | null;
};

export const teamQueryKey = ["team"] as const;

export function getMyTeam(): Promise<MyTeam> {
  return apiRequest<MyTeam>("/api/teams/me");
}

export function createTeam(name: string): Promise<Team> {
  return apiRequest<Team>("/api/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}
