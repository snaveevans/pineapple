import { describe, expect, it } from "vitest";
import { ConflictError, Email, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { CreateTeam } from "./CreateTeam.ts";
import type { EventBus } from "../ports/EventBus.ts";
import { Team } from "../../domain/teams/Team.ts";
import type { TeamRepository } from "../../domain/teams/TeamRepository.ts";
import type { TeamCreated } from "../../domain/teams/events/TeamCreated.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";

class RecordingTeamRepository implements TeamRepository {
  saved: Team | null = null;

  constructor(private readonly existing: Team | null = null) {}

  findById(): Promise<Team | null> {
    return Promise.resolve(null);
  }

  findByMemberId(): Promise<Team | null> {
    return Promise.resolve(this.existing);
  }

  save(team: Team): Promise<void> {
    this.saved = team;
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

class RecordingEventBus implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.events.push(event);
    }
    return Promise.resolve();
  }

  subscribe(): void {}
}

describe("CreateTeam", () => {
  it("creates a team and returns the requester as its sole owner-member", async () => {
    const requester = User.create(Email.from("dale@example.com"), "Dale");
    const teams = new RecordingTeamRepository();
    const users = new FakeUserRepository([requester]);
    const eventBus = new RecordingEventBus();

    const result = await new CreateTeam(teams, users, eventBus).execute({
      requesterId: requester.id,
      name: "The Smiths",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({
      name: "The Smiths",
      ownerId: requester.id,
      members: [{ userId: requester.id, name: "Dale", role: "owner" }],
    });
    expect(teams.saved).not.toBeNull();

    expect(eventBus.events).toHaveLength(1);
    const event = eventBus.events[0] as TeamCreated | undefined;
    expect(event).toMatchObject({
      type: "TeamCreated",
      ownerId: requester.id,
      actorId: requester.id,
      name: "The Smiths",
    });
  });

  it("fails with a conflict when the requester already belongs to a team", async () => {
    const requester = User.create(Email.from("dale@example.com"));
    const existingTeam = Team.create({ ownerId: requester.id, name: "Already in one" });
    existingTeam.pullEvents(); // drain

    const teams = new RecordingTeamRepository(existingTeam);
    const users = new FakeUserRepository([requester]);
    const eventBus = new RecordingEventBus();

    const result = await new CreateTeam(teams, users, eventBus).execute({
      requesterId: requester.id,
      name: "New Team",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ConflictError);
    expect(teams.saved).toBeNull();
    expect(eventBus.events).toHaveLength(0);
  });

  it("rejects an invalid name without creating a team", async () => {
    const requester = User.create(Email.from("dale@example.com"));
    const teams = new RecordingTeamRepository();
    const users = new FakeUserRepository([requester]);
    const eventBus = new RecordingEventBus();

    const result = await new CreateTeam(teams, users, eventBus).execute({
      requesterId: requester.id,
      name: "   ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ValidationError);
    expect(teams.saved).toBeNull();
    expect(eventBus.events).toHaveLength(0);
  });
});
