import { DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from "../onboarding/onboardingForm";

export { DISPLAY_NAME_MAX_LENGTH };

/** Matches domain `Team.#validateName` and Zod `CreateTeamBody` (no trailing period). */
export const TEAM_NAME_REQUIRED_MESSAGE = "Team name is required";
export const TEAM_NAME_TOO_LONG_MESSAGE = "Team name must be 100 characters or fewer";

export type TeamNameFieldError = "empty" | "too-long";

export function validateTeamName(
  name: string,
): { ok: true; value: string } | { ok: false; error: TeamNameFieldError; message: string } {
  const result = validateDisplayName(name);
  if (result.ok) return result;
  return {
    ok: false,
    error: result.error,
    message: result.error === "empty" ? TEAM_NAME_REQUIRED_MESSAGE : TEAM_NAME_TOO_LONG_MESSAGE,
  };
}

export function toTeamFormError(error: {
  field?: string | undefined;
  message: string;
}): TeamNameFieldError | null {
  if (error.field !== "name") return null;
  // Match server messages with or without trailing punctuation / minor wording drift.
  if (/100 characters|too long|fewer/i.test(error.message)) return "too-long";
  return "empty";
}
