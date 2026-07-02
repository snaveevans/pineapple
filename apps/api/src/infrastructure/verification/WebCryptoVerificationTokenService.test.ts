import { describe, expect, it } from "vitest";
import { WebCryptoVerificationTokenService } from "./WebCryptoVerificationTokenService.ts";

describe("WebCryptoVerificationTokenService", () => {
  const service = new WebCryptoVerificationTokenService();

  it("generates a token whose stored hash matches re-hashing the raw token", async () => {
    const { token, tokenHash } = await service.generate();

    expect(token.length).toBeGreaterThan(0);
    // the hash is not the raw token
    expect(tokenHash).not.toBe(token);
    // hex SHA-256 is 64 chars
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await service.hash(token)).toBe(tokenHash);
  });

  it("produces distinct tokens across calls", async () => {
    const a = await service.generate();
    const b = await service.generate();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("hashes deterministically", async () => {
    expect(await service.hash("same-input")).toBe(await service.hash("same-input"));
  });
});
