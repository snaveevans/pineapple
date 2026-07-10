import { describe, expect, it } from "vitest";
import { UserId, Email } from "@snaveevans/pineapple-shared";
import { CreateTeam } from "./CreateTeam.ts";
import type { Team } from "../../domain/team/Team.ts";
import type { TeamRepository } from "../../domain/team/TeamRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { Team as TeamAggregate } from "../../domain/team/Team.ts";

class FakeTeamRepository implements TeamRepository {
  existingTeam: Team | null = null;
  saved: Team | null = null;

  findByMember(): Promise<Team | null> {
    return Promise.resolve(this.existingTeam);
  }

  findById(): Promise<Team | null> {
    return Promise.resolve(null);
  }

  save(team: Team): Promise<void> {
    this.saved = team;
    return Promise.resolve();
  }
}

class FakeUserRepository implements UserRepository {
  constructor(private readonly user: User | null) {}

  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class RecordingEventBus implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) this.events.push(event);
    return Promise.resolve();
  }

  subscribe(): void {}
}

describe("CreateTeam", () => {
  const ownerId = UserId.generate();

  it("creates a team, saves it, publishes TeamCreated, and returns the read model", async () => {
    const teams = new FakeTeamRepository();
    const users = new FakeUserRepository(
      User.reconstitute({
        id: ownerId,
        email: Email.from("test@example.com"),
        name: "Dale",
        onboardingCompletedAt: null,
        createdAt: new Date(),
      }),
    );
    const eventBus = new RecordingEventBus();

    const result = await new CreateTeam(teams, users, eventBus).execute({
      ownerId,
      name: "Field Ops",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("Field Ops");
    expect(result.value.ownerId).toBe(ownerId);
    expect(result.value.members).toHaveLength(1);
    expect(result.value.members[0]).toMatchObject({
      userId: ownerId,
      name: "Dale",
      role: "owner",
    });

    expect(teams.saved).not.toBeNull();
    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.events[0]?.type).toBe("TeamCreated");
  });

  it("returns 409 Conflict when user already belongs to a team", async () => {
    const teams = new FakeTeamRepository();
    teams.existingTeam = TeamAggregate.create({ ownerId, name: "Existing" });
    const users = new FakeUserRepository(null);
    const eventBus = new RecordingEventBus();

    const result = await new CreateTeam(teams, users, eventBus).execute({
      ownerId,
      name: "New Team",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.name).toBe("ConflictError");
    expect(teams.saved).toBeNull();
    expect(eventBus.events).toHaveLength(0);
  });
});
