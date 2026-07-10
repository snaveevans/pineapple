import { TeamId, UserId, InvariantError, ValidationError } from "@snaveevans/pineapple-shared";
import { DISPLAY_NAME_MAX_LENGTH } from "../identity/User.ts";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { TeamCreated } from "./events/TeamCreated.ts";

export type TeamRole = "owner" | "member";

export type TeamMember = {
  userId: UserId;
  role: TeamRole;
};

export class Team {
  private _domainEvents: DomainEvent[] = [];
  private _members: TeamMember[];

  private constructor(
    readonly id: TeamId,
    public name: string,
    members: TeamMember[],
    readonly createdAt: Date,
  ) {
    this._members = members;
  }

  get members(): readonly TeamMember[] {
    return this._members;
  }

  get ownerId(): UserId {
    const owner = this._members.find((member) => member.role === "owner");
    if (!owner) throw new InvariantError("Team has no owner");
    return owner.userId;
  }

  isMember(userId: UserId): boolean {
    return this._members.some((member) => member.userId === userId);
  }

  static create(props: { ownerId: UserId; name: string }): Team {
    const name = Team.#validateName(props.name);
    const team = new Team(
      TeamId.generate(),
      name,
      [{ userId: props.ownerId, role: "owner" }],
      new Date(),
    );
    team._domainEvents.push(
      TeamCreated({ teamId: team.id, ownerId: props.ownerId, actorId: props.ownerId, name }),
    );
    return team;
  }

  static reconstitute(props: {
    id: TeamId;
    name: string;
    members: TeamMember[];
    createdAt: Date;
  }): Team {
    return new Team(props.id, props.name, props.members, props.createdAt);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  static #validateName(name: string): string {
    const trimmed = name?.trim() ?? "";
    if (trimmed.length === 0) {
      throw new ValidationError("Team name is required", "name");
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new ValidationError(
        `Team name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`,
        "name",
      );
    }
    return trimmed;
  }
}
