import { createRemoteJWKSet, jwtVerify } from "jose";
import { Email, InvariantError } from "@snaveevans/pineapple-shared";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import type { AuthenticatedUserResolver } from "../../application/ports/AuthenticatedUserResolver.ts";

/**
 * Resolves the authenticated caller by verifying the Cf-Access-Jwt-Assertion
 * header injected by Cloudflare Access.
 *
 * Verification uses the team's JWKS endpoint so the signature is checked
 * against Cloudflare's actual signing keys — not just trusted blindly.
 * Cloudflare rotates keys every 6 weeks; the remote JWKS set handles this
 * automatically by fetching fresh keys when needed.
 *
 * Auto-registers new users on their first request (just-in-time provisioning).
 *
 * LOCAL DEV: Pass `devEmail` to bypass JWT verification entirely. Set
 * DEV_AUTH_EMAIL in apps/api/.dev.vars — wrangler reads this file locally
 * and it is gitignored. Never set it in wrangler.toml or in production.
 */
export class CloudflareAccessResolver implements AuthenticatedUserResolver {
  constructor(
    private readonly users: UserRepository,
    private readonly teamDomain: string,
    private readonly aud: string,
    private readonly devEmail?: string,
  ) {}

  async resolve(request: Request): Promise<User> {
    const email = this.devEmail ? this.#resolveDevEmail() : await this.#resolveFromJwt(request);

    let user = await this.users.findByEmail(email);
    if (!user) {
      user = User.create(email);
      await this.users.save(user);
    }
    return user;
  }

  /** Dev-only: skip all JWT verification, use the configured email directly. */
  #resolveDevEmail(): Email {
    return Email.from(this.devEmail!);
  }

  /** Production: verify the Cf-Access-Jwt-Assertion header against Cloudflare's JWKS. */
  async #resolveFromJwt(request: Request): Promise<Email> {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) {
      throw new InvariantError(
        "Cf-Access-Jwt-Assertion header missing — is Cloudflare Access configured in front of this Worker?",
      );
    }

    const JWKS = createRemoteJWKSet(new URL(`${this.teamDomain}/cdn-cgi/access/certs`));

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: this.teamDomain,
        audience: this.aud,
      });

      const rawEmail = payload["email"];
      if (typeof rawEmail !== "string") {
        throw new InvariantError("CF Access JWT payload is missing the email claim");
      }
      return Email.from(rawEmail);
    } catch (e) {
      if (e instanceof InvariantError) throw e;
      throw new InvariantError(
        `CF Access JWT verification failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
