// Keep in sync with DISPLAY_NAME_MAX_LENGTH in apps/api/src/domain/identity/User.ts
export const DISPLAY_NAME_MAX_LENGTH = 100;

export const NAME_REQUIRED_MESSAGE = "Name is required.";
export const NAME_TOO_LONG_MESSAGE = "Name must be 100 characters or fewer.";

export type DisplayNameFieldError = "empty" | "too-long";

export function validateDisplayName(
  name: string,
): { ok: true; value: string } | { ok: false; error: DisplayNameFieldError; message: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "empty", message: NAME_REQUIRED_MESSAGE };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: "too-long", message: NAME_TOO_LONG_MESSAGE };
  }
  return { ok: true, value: trimmed };
}

export function toProfileFormError(error: {
  field?: string | undefined;
  message: string;
}): DisplayNameFieldError | null {
  if (error.field !== "name") return null;
  if (error.message === NAME_TOO_LONG_MESSAGE) return "too-long";
  return "empty";
}
