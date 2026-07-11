import { describe, expect, it } from "vitest";
import { UserId, Email } from "@snaveevans/pineapple-shared";
import { GetMyTeam } from "./GetMyTeam.ts";
import { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";

class FakeTeamRepository implements TeamRepository {
  constructor(private readonly team: Team | null) {}

  findByMember(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }

  findById(): Promise<Team | null> {
    return Promise.resolve(this.team);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeUserRepository implements UserRepository {
  private readonly users: Map<string, User>;

  constructor(users: User[]) {
    this.users = new Map(users.map((u) => [u.id, u]));
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByIds(ids: readonly string[]): Promise<User[]> {
    return Promise.resolve(
      ids.map((id) => this.users.get(id)).filter((u): u is User => u !== undefined),
    );
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("GetMyTeam", () => {
  const ownerId = UserId.generate();

  it("returns the team with member display names when the user has a team", async () => {
    const team = Team.create({ ownerId, name: "Field Ops" });
    const teams = new FakeTeamRepository(team);
    const users = new FakeUserRepository([
      User.reconstitute({
        id: ownerId,
        email: Email.from("test@example.com"),
        name: "Dale",
        onboardingCompletedAt: null,
        createdAt: new Date(),
      }),
    ]);

    const result = await new GetMyTeam(teams, users).execute({ userId: ownerId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.team).not.toBeNull();
    expect(result.value.viewerUserId).toBe(ownerId);
    expect(result.value.team!.name).toBe("Field Ops");
    expect(result.value.team!.members).toHaveLength(1);
    expect(result.value.team!.members[0]).toMatchObject({
      userId: ownerId,
      name: "Dale",
      role: "owner",
    });
  });

  it("returns { team: null } with viewerUserId when the user has no team", async () => {
    const teams = new FakeTeamRepository(null);
    const users = new FakeUserRepository([]);

    const result = await new GetMyTeam(teams, users).execute({ userId: ownerId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.team).toBeNull();
    expect(result.value.viewerUserId).toBe(ownerId);
  });
});
