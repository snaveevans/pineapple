/**
 * What a verification token / send proves ownership for. Keyed alongside
 * `(user, email)` so the same address can be verified independently for
 * different purposes. v1 ships only the contact / notification email.
 */
export const VERIFICATION_PURPOSES = ["notification_email"] as const;

export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export function isVerificationPurpose(value: unknown): value is VerificationPurpose {
  return typeof value === "string" && (VERIFICATION_PURPOSES as readonly string[]).includes(value);
}
