import { createBrowserRouter } from "react-router";
import { AuthFlow } from "./auth/AuthFlow";
import { AppAddAsset } from "./app/AppAddAsset";
import { AppAssets } from "./app/AppAssets";
import { AppHome } from "./app/AppHome";
import { AppMaintenanceRecords } from "./app/AppMaintenanceRecords";
import { AppProfileEdit } from "./app/AppProfileEdit";
import { MarketingHome } from "./marketing/MarketingHome";
import { OnboardingGuard } from "./onboarding/OnboardingGuard";
import { OnboardingScreen } from "./onboarding/OnboardingScreen";
import { routePaths } from "./routes";

export const router = createBrowserRouter([
  { path: routePaths.home, element: <MarketingHome /> },
  { path: routePaths.login, element: <AuthFlow /> },
  { path: routePaths.onboarding, element: <OnboardingScreen /> },
  {
    path: "/app",
    element: <OnboardingGuard />,
    children: [
      { index: true, element: <AppHome /> },
      { path: "profile", element: <AppProfileEdit /> },
      { path: "assets", element: <AppAssets /> },
      { path: "assets/new", element: <AppAddAsset /> },
      { path: "assets/:assetId/maintenance", element: <AppMaintenanceRecords /> },
    ],
  },
  // TODO: unknown routes currently fall back to the marketing home. Design a
  // real not-found / 404 experience and route it here.
  { path: "*", element: <MarketingHome /> },
]);