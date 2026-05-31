import { createBrowserRouter, redirect, type LoaderFunctionArgs } from "react-router";
import { getSession } from "./api/client";
import { AuthFlow } from "./auth/AuthFlow";
import { loginPath, safeAppPath } from "./auth/redirects";
import { AppAddAsset } from "./app/AppAddAsset";
import { AppAssets } from "./app/AppAssets";
import { AppHome } from "./app/AppHome";
import { MarketingHome } from "./marketing/MarketingHome";
import { NotFoundPage, ProtectedAppLayout, RouteErrorPage } from "./routing/RoutePages";
import { routePaths } from "./routes";

export async function requireSession({ request }: LoaderFunctionArgs) {
  const session = await getSession();
  if (session) return session;

  const url = new URL(request.url);
  return redirect(loginPath({ next: safeAppPath(`${url.pathname}${url.search}${url.hash}`) }));
}

export const router = createBrowserRouter([
  {
    path: routePaths.home,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <MarketingHome /> },
      { path: routePaths.login, element: <AuthFlow /> },
      {
        path: routePaths.appHome,
        loader: requireSession,
        element: <ProtectedAppLayout />,
        children: [
          { index: true, element: <AppHome /> },
          { path: "assets", element: <AppAssets /> },
          { path: "assets/new", element: <AppAddAsset /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
