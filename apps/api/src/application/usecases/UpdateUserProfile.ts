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

export type UpdateUserProfileCommand = {
  userId: UserId;
  name: string;
};

export class UpdateUserProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: UpdateUserProfileCommand): Promise<Result<User, DomainError>> {
    try {
      const user = await this.users.findById(cmd.userId);
      if (!user) return err(new NotFoundError("User not found"));
      user.updateProfile(cmd.name);
      await this.users.save(user);
      await this.eventBus.publishAll(user.pullEvents());
      return ok(user);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
