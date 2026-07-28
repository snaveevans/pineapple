import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client.ts";
import type { components } from "./schema.ts";

export type UserProfile = components["schemas"]["UserProfile"];

export const userProfileQueryKey = ["userProfile"] as const;

export function getUserProfile(): Promise<UserProfile> {
  return apiGet("/api/users/me");
}

export function updateUserProfile(name: string): Promise<UserProfile> {
  return apiPatch("/api/users/me", { body: { name } });
}

export function setNotificationEmail(email: string): Promise<UserProfile> {
  return apiPut("/api/users/me/notification-email", { body: { email } });
}

export function removeNotificationEmail(): Promise<UserProfile> {
  return apiDelete("/api/users/me/notification-email");
}

export function requestEmailVerification(): Promise<
  components["schemas"]["RequestEmailVerificationResponse"]
> {
  return apiPost("/api/users/me/notification-email/verification");
}

export function isOnboardingComplete(profile: UserProfile): boolean {
  return profile.onboardingCompletedAt !== null;
}
