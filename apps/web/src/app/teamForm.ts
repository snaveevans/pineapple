import { DISPLAY_NAME_MAX_LENGTH } from "../onboarding/onboardingForm";

export { DISPLAY_NAME_MAX_LENGTH };

export const TEAM_NAME_REQUIRED_MESSAGE = "Team name is required.";
export const TEAM_NAME_TOO_LONG_MESSAGE = "Team name must be 100 characters or fewer.";

export type TeamNameFieldError = "empty" | "too-long";

export function validateTeamName(
  name: string,
): { ok: true; value: string } | { ok: false; error: TeamNameFieldError; message: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "empty", message: TEAM_NAME_REQUIRED_MESSAGE };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: "too-long", message: TEAM_NAME_TOO_LONG_MESSAGE };
  }
  return { ok: true, value: trimmed };
}

export function toTeamFormError(error: {
  field?: string | undefined;
  message: string;
}): TeamNameFieldError | null {
  if (error.field !== "name") return null;
  if (error.message === TEAM_NAME_TOO_LONG_MESSAGE) return "too-long";
  return "empty";
}
