import { describe, expect, it } from "vitest";
import { Email, UserId } from "@snaveevans/pineapple-shared";
import { GetMyTeam } from "./GetMyTeam.ts";
import { Team } from "../../domain/teams/Team.ts";
import type { TeamRepository } from "../../domain/teams/TeamRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";

class FakeTeamRepository implements TeamRepository {
  constructor(private readonly team: Team | null) {}

  findById(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }

  findByMemberId(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeUserRepository implements UserRepository {
  constructor(private readonly users: User[]) {}

  findById(id: UserId): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("GetMyTeam", () => {
  it("returns the caller's team with resolved member names", async () => {
    const owner = User.create(Email.from("dale@example.com"), "Dale");
    const team = Team.create({ ownerId: owner.id, name: "The Smiths" });
    team.pullEvents(); // drain

    const result = await new GetMyTeam(
      new FakeTeamRepository(team),
      new FakeUserRepository([owner]),
    ).execute({ requesterId: owner.id });

    expect(result).toEqual({
      ok: true,
      value: {
        team: {
          id: team.id,
          name: "The Smiths",
          ownerId: owner.id,
          members: [{ userId: owner.id, name: "Dale", role: "owner" }],
          createdAt: team.createdAt,
        },
      },
    });
  });

  it("returns an explicit null team when the requester belongs to no team", async () => {
    const requesterId = UserId.generate();

    const result = await new GetMyTeam(
      new FakeTeamRepository(null),
      new FakeUserRepository([]),
    ).execute({ requesterId });

    expect(result).toEqual({ ok: true, value: { team: null } });
  });
});
