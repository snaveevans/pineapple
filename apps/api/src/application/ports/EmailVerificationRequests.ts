import type { DomainError, Email, Result, UserId } from "@snaveevans/pineapple-shared";

/**
 * Port: requests a verification send for a user's contact / notification email.
 *
 * The contact-email set path uses this when it stores an address that the
 * identity provider has NOT already proven, to trigger an initial verification
 * email. The concrete implementation (token issuance, rate limiting, and the
 * actual send) belongs to the email-verification feature.
 *
 * Returns `Result` so rate-limit rejections (`TooManyRequestsError` → 429) and
 * other domain errors propagate to the caller without throwing; a rejected send
 * does not undo the stored (unverified) address.
 */
export interface EmailVerificationRequests {
  request(input: { userId: UserId; email: Email }): Promise<Result<void, DomainError>>;
}
