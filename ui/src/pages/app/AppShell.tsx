import { Outlet, useLocation } from "react-router-dom";
import { PageShell } from "../../components/PageShell";

const ROUTE_TITLES: Record<string, string> = {
  "/app/looks": "Looks",
  "/app/workspaces": "Workspaces",
  "/app/trends": "Trends",
};

function getTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith("/app/looks/")) return "Look Detail";
  if (pathname.startsWith("/app/workspace/")) return "Workspace";
  return "Studio";
}

export default function AppShell() {
  const location = useLocation();
  const title = getTitle(location.pathname);

  return (
    <PageShell title={title}>
      <Outlet />
    </PageShell>
  );
}
