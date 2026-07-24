import { Email, InvariantError, ValidationError } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH, User } from "./User.ts";

describe("User", () => {
  const email = Email.from("dale@example.com");
  const contactEmail = Email.from("contact@example.com");
  const verifiedAt = new Date("2026-07-02T12:00:00.000Z");

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
      expect(events[0]).toMatchObject({
        type: "UserOnboardingCompleted",
        userId: user.id,
      });
    });

    it("completes onboarding with a new name on first update", () => {
      const user = User.create(email, "Dale");
      user.updateProfile("DIYer Dale");

      expect(user.name).toBe("DIYer Dale");
      expect(user.onboardingCompletedAt).not.toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "UserOnboardingCompleted",
        userId: user.id,
      });
    });

    it("emits UserNameUpdated when a completed user changes their name", () => {
      const user = User.create(email, "Dale");
      user.updateProfile("Dale");
      user.pullEvents();

      user.updateProfile("New Dale");
      expect(user.name).toBe("New Dale");
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "UserNameUpdated",
        userId: user.id,
      });
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

  describe("contact / notification email", () => {
    it("defaults to no contact email", () => {
      const user = User.create(email);
      expect(user.notificationEmail).toBeNull();
      expect(user.notificationEmailVerifiedAt).toBeNull();
    });

    it("stores an unverified contact email and emits NotificationEmailUpdated", () => {
      const user = User.create(email);
      user.setUnverifiedNotificationEmail(contactEmail);

      expect(user.notificationEmail).toBe(contactEmail);
      expect(user.notificationEmailVerifiedAt).toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "NotificationEmailUpdated",
        userId: user.id,
      });
    });

    it("clears prior verified state when a new unverified address is stored", () => {
      const user = User.create(email);
      user.setVerifiedNotificationEmail(email, verifiedAt);
      user.pullEvents();

      user.setUnverifiedNotificationEmail(contactEmail);
      expect(user.notificationEmail).toBe(contactEmail);
      expect(user.notificationEmailVerifiedAt).toBeNull();
    });

    it("stores a verified contact email and emits both update and verified events", () => {
      const user = User.create(email);
      user.setVerifiedNotificationEmail(email, verifiedAt);

      expect(user.notificationEmail).toBe(email);
      expect(user.notificationEmailVerifiedAt).not.toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: "NotificationEmailUpdated",
        userId: user.id,
      });
      expect(events[1]).toMatchObject({
        type: "NotificationEmailVerified",
        userId: user.id,
      });
    });

    it("marks the current contact email verified and emits NotificationEmailVerified", () => {
      const user = User.create(email);
      user.setUnverifiedNotificationEmail(contactEmail);
      user.pullEvents();

      user.markNotificationEmailVerified(contactEmail, verifiedAt);
      expect(user.notificationEmailVerifiedAt).not.toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "NotificationEmailVerified",
        userId: user.id,
      });
    });

    it("stamps the verified timestamp from the caller's clock, not the wall clock", () => {
      const setUser = User.create(email);
      setUser.setVerifiedNotificationEmail(email, verifiedAt);
      expect(setUser.notificationEmailVerifiedAt).toBe(verifiedAt);

      const markUser = User.create(email);
      markUser.setUnverifiedNotificationEmail(contactEmail);
      markUser.markNotificationEmailVerified(contactEmail, verifiedAt);
      expect(markUser.notificationEmailVerifiedAt).toBe(verifiedAt);
    });

    it("is idempotent when marking an already-verified address", () => {
      const user = User.create(email);
      user.setVerifiedNotificationEmail(email, verifiedAt);
      const priorVerifiedAt = user.notificationEmailVerifiedAt;
      user.pullEvents();

      // A second verify at a different instant must not move the timestamp.
      user.markNotificationEmailVerified(email, new Date("2027-01-01T00:00:00.000Z"));
      expect(user.notificationEmailVerifiedAt).toBe(priorVerifiedAt);
      expect(user.pullEvents()).toHaveLength(0);
    });

    it("rejects verifying an address that is not the current contact email", () => {
      const user = User.create(email);
      user.setUnverifiedNotificationEmail(contactEmail);
      user.pullEvents();

      expect(() => user.markNotificationEmailVerified(email, verifiedAt)).toThrow(InvariantError);
    });

    it("rejects verifying when no contact email is set", () => {
      const user = User.create(email);
      expect(() => user.markNotificationEmailVerified(contactEmail, verifiedAt)).toThrow(
        InvariantError,
      );
    });

    it("removes the contact email and emits NotificationEmailRemoved", () => {
      const user = User.create(email);
      user.setVerifiedNotificationEmail(email, verifiedAt);
      user.pullEvents();

      user.removeNotificationEmail();
      expect(user.notificationEmail).toBeNull();
      expect(user.notificationEmailVerifiedAt).toBeNull();
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "NotificationEmailRemoved",
        userId: user.id,
      });
    });

    it("is an idempotent no-op when removing with no contact email set", () => {
      const user = User.create(email);
      user.removeNotificationEmail();
      expect(user.notificationEmail).toBeNull();
      expect(user.pullEvents()).toHaveLength(0);
    });

    it("rehydrates contact-email state via reconstitute", () => {
      const verifiedAt = new Date("2026-06-01T00:00:00.000Z");
      const user = User.reconstitute({
        id: User.create(email).id,
        email,
        name: "Dale",
        onboardingCompletedAt: new Date(),
        createdAt: new Date(),
        notificationEmail: contactEmail,
        notificationEmailVerifiedAt: verifiedAt,
      });
      expect(user.notificationEmail).toBe(contactEmail);
      expect(user.notificationEmailVerifiedAt).toBe(verifiedAt);
    });
  });
});
