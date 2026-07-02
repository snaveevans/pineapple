/**
 * A freshly generated verification token: the raw opaque `token` that goes in
 * the email link, and its `tokenHash` which is what gets persisted.
 */
export interface GeneratedVerificationToken {
  token: string;
  tokenHash: string;
}

/**
 * Port: generates high-entropy opaque verification tokens and hashes presented
 * tokens for lookup. The raw token is never persisted; storage and matching use
 * the hash. The concrete crypto lives in infrastructure.
 */
export interface VerificationTokenService {
  generate(): Promise<GeneratedVerificationToken>;
  hash(token: string): Promise<string>;
}
