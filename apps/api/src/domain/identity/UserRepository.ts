import type { UserId, Email } from "@snaveevans/pineapple-shared";
import type { User } from "./User";

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByIds(ids: readonly UserId[]): Promise<User[]>;
  findByEmail(email: Email): Promise<User | null>;
  save(user: User): Promise<void>;
}
