import { Link, Outlet } from "react-router";
import { paths } from "../routes";

export function ProtectedAppLayout() {
  return <Outlet />;
}

export function RouteErrorPage() {
  return (
    <main className="route-message">
      <h1>Page unavailable</h1>
      <p>FieldOps could not load this page. Try again in a moment.</p>
      <a href={window.location.href}>Try again</a>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="route-message">
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to={paths.home}>Return home</Link>
    </main>
  );
}
