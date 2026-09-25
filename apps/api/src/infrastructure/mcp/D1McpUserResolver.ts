import { Email, UnauthorizedError } from "@snaveevans/pineapple-shared";
import type { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";

type BetterAuthUserRow = {
  email: string;
};

/** Resolves a verified OAuth token subject into Pineapple's domain identity. */
export class D1McpUserResolver {
  constructor(
    private readonly db: D1Database,
    private readonly users: UserRepository,
  ) {}

  async resolve(subject: unknown): Promise<User> {
    if (typeof subject !== "string" || subject.length === 0) {
      throw new UnauthorizedError("The MCP access token has no valid user subject");
    }

    const authUser = await this.db
      .prepare('SELECT "email" FROM "user" WHERE "id" = ?')
      .bind(subject)
      .first<BetterAuthUserRow>();
    if (!authUser) {
      throw new UnauthorizedError("The MCP access token user no longer exists");
    }

    const user = await this.users.findByEmail(Email.from(authUser.email));
    if (!user) {
      throw new UnauthorizedError("The MCP access token user is not provisioned in Pineapple");
    }

    return user;
  }
}
