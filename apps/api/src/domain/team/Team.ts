import { TeamId, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { DISPLAY_NAME_MAX_LENGTH } from "../identity/User.ts";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { TeamCreated } from "./events/TeamCreated.ts";
import { createMembership, type Membership } from "./Membership.ts";

export class Team {
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    readonly id: TeamId,
    readonly ownerId: UserId,
    public name: string,
    readonly createdAt: Date,
    private readonly _members: Membership[],
  ) {}

  get members(): readonly Membership[] {
    return this._members;
  }

  static create(props: { ownerId: UserId; name: string }): Team {
    const trimmed = Team.#validateName(props.name);
    const now = new Date();
    const team = new Team(TeamId.generate(), props.ownerId, trimmed, now, [
      createMembership({ userId: props.ownerId, role: "owner", joinedAt: now }),
    ]);
    team._domainEvents.push(
      TeamCreated({
        teamId: team.id,
        ownerId: team.ownerId,
        actorId: team.ownerId,
        teamName: team.name,
      }),
    );
    return team;
  }

  static reconstitute(props: {
    id: TeamId;
    ownerId: UserId;
    name: string;
    createdAt: Date;
    members: Membership[];
  }): Team {
    return new Team(props.id, props.ownerId, props.name, props.createdAt, props.members);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  static #validateName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Team name is required", "name");
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new ValidationError("Team name must be 100 characters or fewer", "name");
    }
    return trimmed;
  }
}
