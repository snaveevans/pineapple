import { UserId, type Email, ValidationError } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { UserNameUpdated } from "./events/UserNameUpdated.ts";
import { UserOnboardingCompleted } from "./events/UserOnboardingCompleted.ts";

export const DISPLAY_NAME_MAX_LENGTH = 100;

export class User {
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    readonly id: UserId,
    readonly email: Email,
    public name: string | null,
    public onboardingCompletedAt: Date | null,
    readonly createdAt: Date,
  ) {}

  static create(email: Email, providerName?: string | null): User {
    return new User(
      UserId.generate(),
      email,
      User.#normalizeProviderName(providerName),
      null,
      new Date(),
    );
  }

  static reconstitute(props: {
    id: UserId;
    email: Email;
    name: string | null;
    onboardingCompletedAt: Date | null;
    createdAt: Date;
  }): User {
    return new User(
      props.id,
      props.email,
      props.name,
      props.onboardingCompletedAt,
      props.createdAt,
    );
  }

  updateProfile(name: string): void {
    const trimmed = User.#validateDisplayName(name);
    const wasIncomplete = this.onboardingCompletedAt === null;

    if (wasIncomplete) {
      this.name = trimmed;
      this.onboardingCompletedAt = new Date();
      this._domainEvents.push(UserOnboardingCompleted({ userId: this.id }));
      return;
    }

    if (trimmed === this.name) {
      return;
    }

    this.name = trimmed;
    this._domainEvents.push(UserNameUpdated({ userId: this.id }));
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  static #normalizeProviderName(providerName?: string | null): string | null {
    if (providerName == null) return null;
    const trimmed = providerName.trim();
    if (trimmed.length === 0 || trimmed.length > DISPLAY_NAME_MAX_LENGTH) return null;
    return trimmed;
  }

  static #validateDisplayName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Name is required", "name");
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new ValidationError("Name must be 100 characters or fewer", "name");
    }
    return trimmed;
  }
}
