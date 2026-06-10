import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideSidebar = pathname === "/dashboard/searches/new";

  return (
    <div className="flex h-full w-full bg-[var(--color-bg-base)]">
      {!hideSidebar && <Sidebar />}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
