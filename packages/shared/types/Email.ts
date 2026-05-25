import { ValidationError } from "../errors.ts";

export type Email = string & { readonly _brand: "Email" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Email = {
  from: (raw: string): Email => {
    const trimmed = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      throw new ValidationError("Invalid email", "email");
    }
    return trimmed as Email;
  },
};
