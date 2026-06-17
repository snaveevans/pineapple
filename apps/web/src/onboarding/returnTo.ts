import { paths, routePaths } from "../routes";

const BLOCKED_ONBOARDING_RETURN_PATHS = [routePaths.onboarding, routePaths.profile] as const;

/**
 * Validates a post-onboarding redirect target. Rejects cross-origin paths,
 * onboarding loops, profile edit during first-time onboarding, and non-app routes.
 */
export function safeReturnTo(
  value: string | null,
  origin: string = typeof window !== "undefined" ? window.location.origin : "http://localhost",
): string {
  if (!value) return paths.appHome;

  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return paths.appHome;

    const path = url.pathname;
    if (!path.startsWith("/") || !path.startsWith("/app")) {
      return paths.appHome;
    }

    for (const blocked of BLOCKED_ONBOARDING_RETURN_PATHS) {
      if (path === blocked || path.startsWith(`${blocked}/`)) {
        return paths.appHome;
      }
    }

    return `${path}${url.search}`;
  } catch {
    return paths.appHome;
  }
}
