export type LoginMode = "login" | "signup";

export const routePaths = {
  home: "/",
  login: "/login",
  onboarding: "/onboarding",
  appHome: "/app",
  assets: "/app/assets",
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
  assets: routePaths.assets,
  addAsset: routePaths.addAsset,
  assetMaintenance: (assetId: string) => `/app/assets/${assetId}/maintenance`,
} as const;
