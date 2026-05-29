import { UserId, Email } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";

type UserRow = {
  id: string;
  email: string;
  created_at: string;
};

export class D1UserRepository implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
      .bind(id)
      .first<UserRow>();
    return row ? this.#rowToUser(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT id, email, created_at FROM users WHERE email = ?")
      .bind(email)
      .first<UserRow>();
    return row ? this.#rowToUser(row) : null;
  }

  async save(user: User): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO users (id, email, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET email = excluded.email`,
      )
      .bind(user.id, user.email, user.createdAt.toISOString())
      .run();
  }

  #rowToUser(row: UserRow): User {
    return User.reconstitute({
      id: UserId.from(row.id),
      email: Email.from(row.email),
      createdAt: new Date(row.created_at),
    });
  }
}
