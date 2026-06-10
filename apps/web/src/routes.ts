export type LoginMode = "login" | "signup";

export const routePaths = {
  home: "/",
  login: "/login",
  appHome: "/app",
  assets: "/app/assets",
  addAsset: "/app/assets/new",
  assetMaintenance: "/app/assets/:assetId/maintenance",
} as const;

export const paths = {
  home: routePaths.home,
  login: (mode?: LoginMode) => (mode ? `${routePaths.login}?mode=${mode}` : routePaths.login),
  appHome: routePaths.appHome,
  assets: routePaths.assets,
  addAsset: routePaths.addAsset,
  assetMaintenance: (assetId: string) => `/app/assets/${assetId}/maintenance`,
} as const;
