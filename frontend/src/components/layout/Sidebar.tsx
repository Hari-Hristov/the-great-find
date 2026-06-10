import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Bell, Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const items: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/searches", label: "Searches", icon: Search },
  { to: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] px-3 py-5">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-accent)] text-[var(--color-bg-base)]">
          <span className="font-display text-sm font-bold">+</span>
        </div>
        <span className="font-display text-sm font-semibold tracking-tight">
          the great find
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            item.to === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-4 text-xs text-[var(--color-text-muted)]">
        <div>Local-only · 127.0.0.1</div>
        <div className="mt-1 opacity-70">v0.1.0 · phase 6</div>
      </div>
    </aside>
  );
}
