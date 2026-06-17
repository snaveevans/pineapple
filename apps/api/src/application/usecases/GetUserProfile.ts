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

export type GetUserProfileQuery = {
  userId: UserId;
};

export class GetUserProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(query: GetUserProfileQuery): Promise<Result<User, DomainError>> {
    try {
      const user = await this.users.findById(query.userId);
      if (!user) return err(new NotFoundError("User not found"));
      return ok(user);
    } catch (e) {
      if (e instanceof DomainErrorClass) return err(e);
      throw e;
    }
  }
}
