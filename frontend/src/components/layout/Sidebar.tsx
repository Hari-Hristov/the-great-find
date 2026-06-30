import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, EyeOff, LayoutDashboard, Search, Settings, X } from "lucide-react";
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
  { to: "/dashboard/flagged", label: "Flagged", icon: EyeOff },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  emailUnconfigured?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ emailUnconfigured, open, onClose }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        // base — shared between mobile drawer and desktop static
        "flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] px-3 py-5",
        // desktop: always visible in the normal flow
        "lg:relative lg:translate-x-0 lg:shadow-none",
        // mobile/tablet: fixed drawer, slides in/out
        "fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:flex",
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full",
      )}
    >
      <div className="mb-8 flex items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-accent)] text-[var(--color-bg-base)]">
            <span className="font-display text-sm font-bold">+</span>
          </div>
          <span className="font-display text-sm font-semibold tracking-tight">
            the great find
          </span>
        </div>
        {/* Close button — only visible on mobile/tablet */}
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            item.to === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.to);
          const Icon = item.icon;
          const showDot = item.to === "/dashboard/settings" && emailUnconfigured;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]",
              )}
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {showDot && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </span>
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
