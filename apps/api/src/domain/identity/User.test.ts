import { Email, ValidationError } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH, User } from "./User.ts";

describe("User", () => {
  const email = Email.from("dale@example.com");

  describe("create", () => {
    it("copies a trimmed provider name when valid", () => {
      const user = User.create(email, "  Dale  ");
      expect(user.name).toBe("Dale");
      expect(user.onboardingCompletedAt).toBeNull();
    });

    it("stores null when the provider name is absent or blank", () => {
      expect(User.create(email).name).toBeNull();
      expect(User.create(email, null).name).toBeNull();
      expect(User.create(email, "").name).toBeNull();
      expect(User.create(email, "   ").name).toBeNull();
    });

    it("stores null when the provider name exceeds the profile limit", () => {
      const longName = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1);
      expect(User.create(email, longName).name).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("completes onboarding and emits UserOnboardingCompleted on first update", () => {
      const user = User.create(email, "Dale");
      user.updateProfile("Dale");

      expect(user.name).toBe("Dale");
      expect(user.onboardingCompletedAt).not.toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("UserOnboardingCompleted");
    });

    it("completes onboarding with a new name on first update", () => {
      const user = User.create(email, "Dale");
      user.updateProfile("DIYer Dale");

      expect(user.name).toBe("DIYer Dale");
      expect(user.onboardingCompletedAt).not.toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("UserOnboardingCompleted");
    });

    it("emits UserNameUpdated when a completed user changes their name", () => {
      const user = User.create(email, "Dale");
      user.updateProfile("Dale");
      user.pullEvents();

      user.updateProfile("New Dale");
      expect(user.name).toBe("New Dale");
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("UserNameUpdated");
    });

    it("is idempotent when a completed user submits the same name", () => {
      const user = User.create(email, "Dale");
      user.updateProfile("Dale");
      const completedAt = user.onboardingCompletedAt;
      user.pullEvents();

      user.updateProfile("Dale");
      expect(user.onboardingCompletedAt).toBe(completedAt);
      expect(user.pullEvents()).toHaveLength(0);
    });

    it("rejects empty or whitespace-only names", () => {
      const user = User.create(email);
      expect(() => user.updateProfile("   ")).toThrow(ValidationError);
      try {
        user.updateProfile("   ");
      } catch (error) {
        expect(error).toMatchObject({ field: "name" });
      }
    });

    it("rejects names longer than 100 characters after trimming", () => {
      const user = User.create(email);
      const longName = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1);
      expect(() => user.updateProfile(longName)).toThrow(ValidationError);
      try {
        user.updateProfile(longName);
      } catch (error) {
        expect(error).toMatchObject({ field: "name" });
      }
    });
  });
});
