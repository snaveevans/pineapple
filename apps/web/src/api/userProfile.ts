import { apiRequest } from "./client";

export type UserProfile = {
  email: string;
  name: string | null;
  onboardingCompletedAt: string | null;
  notificationEmail: string | null;
  notificationEmailVerified: boolean;
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

export function setNotificationEmail(email: string): Promise<UserProfile> {
  return apiRequest<UserProfile>("/api/users/me/notification-email", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export function removeNotificationEmail(): Promise<UserProfile> {
  return apiRequest<UserProfile>("/api/users/me/notification-email", {
    method: "DELETE",
  });
}

export function requestEmailVerification(): Promise<{ status: "accepted" }> {
  return apiRequest<{ status: "accepted" }>("/api/users/me/notification-email/verification", {
    method: "POST",
  });
}

export function isOnboardingComplete(profile: UserProfile): boolean {
  return profile.onboardingCompletedAt !== null;
}
