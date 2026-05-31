import { routePaths } from "../routes";

export function safeAppPath(candidate?: string | null): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return routePaths.appHome;
  }

  const base = "https://fieldops.invalid";
  const url = new URL(candidate, base);
  if (
    url.origin !== base ||
    (url.pathname !== routePaths.appHome && !url.pathname.startsWith("/app/"))
  ) {
    return routePaths.appHome;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPath({
  next,
  error,
}: {
  next?: string;
  error?: string;
} = {}): string {
  const search = new URLSearchParams();
  if (next !== undefined) search.set("next", safeAppPath(next));
  if (error) search.set("error", error);
  const query = search.toString();
  return query ? `${routePaths.login}?${query}` : routePaths.login;
}
