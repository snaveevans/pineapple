export type LoginMode = "login" | "signup";

export const routePaths = {
  home: "/",
  login: "/login",
  onboarding: "/onboarding",
  appHome: "/app",
  profile: "/app/profile",
  team: "/app/team",
  notifications: "/app/notifications",
  assets: "/app/assets",
  history: "/app/history",
  addAsset: "/app/assets/new",
  assetMaintenance: "/app/assets/:assetId/maintenance",
} as const;

export const paths = {
  home: routePaths.home,
  login: (mode?: LoginMode) => (mode ? `${routePaths.login}?mode=${mode}` : routePaths.login),
  onboarding: (returnTo?: string) =>
    returnTo
      ? `${routePaths.onboarding}?returnTo=${encodeURIComponent(returnTo)}`
      : routePaths.onboarding,
  appHome: routePaths.appHome,
  profile: routePaths.profile,
  team: routePaths.team,
  notifications: routePaths.notifications,
  assets: routePaths.assets,
  history: routePaths.history,
  addAsset: routePaths.addAsset,
  assetMaintenance: (assetId: string) => `/app/assets/${assetId}/maintenance`,
} as const;
