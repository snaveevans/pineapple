import {
  type DomainError,
  DomainError as DomainErrorClass,
  NotFoundError,
  ok,
  err,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { EventBus } from "../ports/EventBus.ts";

export type RemoveNotificationEmailCommand = {
  userId: UserId;
};

/**
 * Removes a user's contact / notification email.
 *
 * Idempotent: when no contact email is set it returns the unchanged profile
 * without emitting an event. When one is set it is cleared along with its
 * verified state and `NotificationEmailRemoved` is published.
 */
export class RemoveNotificationEmail {
  constructor(
    private readonly users: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: RemoveNotificationEmailCommand): Promise<Result<User, DomainError>> {
    try {
      const user = await this.users.findById(cmd.userId);
      if (!user) return err(new NotFoundError("User not found"));

      user.removeNotificationEmail();
      const events = user.pullEvents();
      if (events.length > 0) {
        await this.users.save(user);
        await this.eventBus.publishAll(events);
      }

      return ok(user);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
