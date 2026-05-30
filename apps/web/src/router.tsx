import { createBrowserRouter } from "react-router";
import { AuthFlow } from "./auth/AuthFlow";
import { AppAddAsset } from "./app/AppAddAsset";
import { AppAssets } from "./app/AppAssets";
import { AppHome } from "./app/AppHome";
import { MarketingHome } from "./marketing/MarketingHome";
import { paths, routePaths } from "./routes";

export { paths };

export const router = createBrowserRouter([
  { path: routePaths.home, element: <MarketingHome /> },
  { path: routePaths.login, element: <AuthFlow /> },
  { path: routePaths.appHome, element: <AppHome /> },
  { path: routePaths.assets, element: <AppAssets /> },
  { path: routePaths.addAsset, element: <AppAddAsset /> },
  { path: "*", element: <MarketingHome /> },
]);
