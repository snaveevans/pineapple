import type {
  GeneratedVerificationToken,
  VerificationTokenService,
} from "../../application/ports/VerificationTokenService.ts";

const TOKEN_BYTES = 32;

/**
 * WinterCG/Web Crypto implementation of {@link VerificationTokenService}. Tokens
 * are 256 bits of randomness, base64url-encoded for use in a URL; the stored
 * hash is the hex SHA-256 of the raw token, so the raw token never touches D1.
 */
export class WebCryptoVerificationTokenService implements VerificationTokenService {
  async generate(): Promise<GeneratedVerificationToken> {
    const bytes = new Uint8Array(TOKEN_BYTES);
    crypto.getRandomValues(bytes);
    const token = base64url(bytes);
    const tokenHash = await this.hash(token);
    return { token, tokenHash };
  }

  async hash(token: string): Promise<string> {
    const data = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toHex(new Uint8Array(digest));
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
