import { InvariantError } from "@snaveevans/pineapple-shared";

export function getAuthBaseURL(requestURL: string, configuredBaseURL?: string): string {
  return configuredBaseURL ?? new URL(requestURL).origin;
}

export function isLoopbackOrigin(value: string): boolean {
  try {
    const { hostname, origin } = new URL(value);
    return (
      origin === value &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

export function getTrustedDevWebOrigins(baseURL: string, configuredOrigins?: string): string[] {
  if (!isLoopbackOrigin(baseURL)) return [];
  return (
    configuredOrigins
      ?.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => isLoopbackOrigin(origin)) ?? []
  );
}

export function getAllowedApiCorsOrigin(
  requestOrigin: string,
  baseURL: string,
  configuredDevOrigins?: string,
): string | undefined {
  const allowedOrigins = new Set([
    new URL(baseURL).origin,
    ...getTrustedDevWebOrigins(baseURL, configuredDevOrigins),
  ]);
  return allowedOrigins.has(requestOrigin) ? requestOrigin : undefined;
}

export function resolveDevAuthEmail({
  enabled,
  email,
  baseURL,
}: {
  enabled: string | undefined;
  email: string | undefined;
  baseURL: string;
}): string | undefined {
  if (enabled === undefined && email === undefined) return undefined;
  if (enabled !== "true" || !email || !isLoopbackOrigin(baseURL)) {
    throw new InvariantError("Invalid local authentication bypass configuration");
  }
  return email;
}
