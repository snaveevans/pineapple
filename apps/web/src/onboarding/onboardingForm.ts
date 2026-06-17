export const DISPLAY_NAME_MAX_LENGTH = 100;

export type DisplayNameFieldError = "empty" | "too-long";

export function validateDisplayName(
  name: string,
): { ok: true; value: string } | { ok: false; error: DisplayNameFieldError; message: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "empty", message: "Name is required." };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: "too-long", message: "Name must be 100 characters or less." };
  }
  return { ok: true, value: trimmed };
}

export function toProfileFormError(error: {
  field?: string | undefined;
  message: string;
}): DisplayNameFieldError | null {
  if (error.field !== "name") return null;
  if (error.message.toLowerCase().includes("100")) return "too-long";
  return "empty";
}
