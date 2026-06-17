import { apiRequest } from "./client";

export type UserProfile = {
  email: string;
  name: string | null;
  onboardingCompletedAt: string | null;
};

export const userProfileQueryKey = ["userProfile"] as const;

export function getUserProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>("/api/users/me");
}

export function updateUserProfile(name: string): Promise<UserProfile> {
  return apiRequest<UserProfile>("/api/users/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function isOnboardingComplete(profile: UserProfile): boolean {
  return profile.onboardingCompletedAt !== null;
}
