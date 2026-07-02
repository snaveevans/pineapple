/**
 * Anti-abuse thresholds and token lifetime for email verification. These are
 * tunable configuration, not part of the API contract (see email-verification.md).
 */

/** Verification tokens are valid for 24 hours. */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Minimum interval between consecutive sends to the same address. */
export const VERIFICATION_COOLDOWN_MS = 60 * 1000;

/** Rolling window for both daily caps. */
export const VERIFICATION_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Max sends to a single address within the window, counted across all users. */
export const VERIFICATION_PER_ADDRESS_CAP = 5;

/** Max verification sends initiated by a single user within the window. */
export const VERIFICATION_PER_USER_CAP = 10;
