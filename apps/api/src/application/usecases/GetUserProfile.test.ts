import { Email, UserId } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { GetUserProfile } from "./GetUserProfile.ts";

class InMemoryUserRepository implements UserRepository {
  constructor(private readonly user: User | null) {}

  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findByIds(): Promise<User[]> {
    return Promise.resolve(this.user ? [this.user] : []);
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe("GetUserProfile", () => {
  it("returns the authenticated user's profile", async () => {
    const user = User.create(Email.from("dale@example.com"), "Dale");
    const result = await new GetUserProfile(new InMemoryUserRepository(user)).execute({
      userId: user.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(user);
    }
  });

  it("returns not found when the user does not exist", async () => {
    const result = await new GetUserProfile(new InMemoryUserRepository(null)).execute({
      userId: UserId.generate(),
    });

    expect(result.ok).toBe(false);
  });
});
