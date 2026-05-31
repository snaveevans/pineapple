import { createBrowserRouter } from "react-router";
import { AuthFlow } from "./auth/AuthFlow";
import { AppAddAsset } from "./app/AppAddAsset";
import { AppAssets } from "./app/AppAssets";
import { AppHome } from "./app/AppHome";
import { MarketingHome } from "./marketing/MarketingHome";
import { routePaths } from "./routes";

export const router = createBrowserRouter([
  { path: routePaths.home, element: <MarketingHome /> },
  { path: routePaths.login, element: <AuthFlow /> },
  { path: routePaths.appHome, element: <AppHome /> },
  { path: routePaths.assets, element: <AppAssets /> },
  { path: routePaths.addAsset, element: <AppAddAsset /> },
  // TODO: unknown routes currently fall back to the marketing home. Design a
  // real not-found / 404 experience and route it here.
  { path: "*", element: <MarketingHome /> },
]);
