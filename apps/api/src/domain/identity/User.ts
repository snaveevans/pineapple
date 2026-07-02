import { UserId, type Email, InvariantError, ValidationError } from "@snaveevans/pineapple-shared";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { NotificationEmailRemoved } from "./events/NotificationEmailRemoved.ts";
import { NotificationEmailUpdated } from "./events/NotificationEmailUpdated.ts";
import { NotificationEmailVerified } from "./events/NotificationEmailVerified.ts";
import { UserNameUpdated } from "./events/UserNameUpdated.ts";
import { UserOnboardingCompleted } from "./events/UserOnboardingCompleted.ts";

// Keep in sync with DISPLAY_NAME_MAX_LENGTH in apps/web/src/onboarding/onboardingForm.ts
export const DISPLAY_NAME_MAX_LENGTH = 100;

export class User {
  private _domainEvents: DomainEvent[] = [];

  private _notificationEmail: Email | null;
  private _notificationEmailVerifiedAt: Date | null;

  private constructor(
    readonly id: UserId,
    readonly email: Email,
    public name: string | null,
    public onboardingCompletedAt: Date | null,
    readonly createdAt: Date,
    notificationEmail: Email | null,
    notificationEmailVerifiedAt: Date | null,
  ) {
    this._notificationEmail = notificationEmail;
    this._notificationEmailVerifiedAt = notificationEmailVerifiedAt;
  }

  get notificationEmail(): Email | null {
    return this._notificationEmail;
  }

  get notificationEmailVerifiedAt(): Date | null {
    return this._notificationEmailVerifiedAt;
  }

  static create(email: Email, providerName?: string | null): User {
    return new User(
      UserId.generate(),
      email,
      User.#normalizeProviderName(providerName),
      null,
      new Date(),
      null,
      null,
    );
  }

  static reconstitute(props: {
    id: UserId;
    email: Email;
    name: string | null;
    onboardingCompletedAt: Date | null;
    createdAt: Date;
    notificationEmail?: Email | null;
    notificationEmailVerifiedAt?: Date | null;
  }): User {
    return new User(
      props.id,
      props.email,
      props.name,
      props.onboardingCompletedAt,
      props.createdAt,
      props.notificationEmail ?? null,
      props.notificationEmailVerifiedAt ?? null,
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

  /**
   * Stores a new contact email as unverified, clearing any prior verified state.
   * Used when the submitted address is not the caller's provider-verified auth email.
   */
  setUnverifiedNotificationEmail(email: Email): void {
    this._notificationEmail = email;
    this._notificationEmailVerifiedAt = null;
    this._domainEvents.push(NotificationEmailUpdated({ userId: this.id }));
  }

  /**
   * Stores a new contact email already verified — the provider proved ownership
   * because the address equals the caller's verified auth email. Emits both the
   * address-change and verification events.
   */
  setVerifiedNotificationEmail(email: Email, verifiedAt: Date): void {
    this._notificationEmail = email;
    this._notificationEmailVerifiedAt = verifiedAt;
    this._domainEvents.push(NotificationEmailUpdated({ userId: this.id }));
    this._domainEvents.push(NotificationEmailVerified({ userId: this.id }));
  }

  /**
   * Marks the current contact email verified at the caller-supplied instant.
   * Idempotent when already verified. The caller is responsible for confirming
   * that `email` is the address that was proven; a mismatch signals a superseded
   * or stale confirmation and is rejected. The timestamp comes from the caller's
   * clock so it stays consistent with the token-consumption instant.
   */
  markNotificationEmailVerified(email: Email, verifiedAt: Date): void {
    if (this._notificationEmail === null || this._notificationEmail !== email) {
      throw new InvariantError("Cannot verify an address that is not the current contact email");
    }
    if (this._notificationEmailVerifiedAt !== null) {
      return;
    }
    this._notificationEmailVerifiedAt = verifiedAt;
    this._domainEvents.push(NotificationEmailVerified({ userId: this.id }));
  }

  /**
   * Clears the contact email and its verified state. Idempotent no-op when no
   * contact email is set (no event emitted).
   */
  removeNotificationEmail(): void {
    if (this._notificationEmail === null) {
      return;
    }
    this._notificationEmail = null;
    this._notificationEmailVerifiedAt = null;
    this._domainEvents.push(NotificationEmailRemoved({ userId: this.id }));
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
