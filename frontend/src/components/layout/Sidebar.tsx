import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, EyeOff, LayoutDashboard, Search, Settings, X } from "lucide-react";
import { useMemo } from "react";
import { useEventStreamContext } from "@/contexts/EventStreamContext";
import { useAlerts } from "@/api/hooks/queries";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
  const { lastAlertsVisit } = useEventStreamContext();
  const alerts = useAlerts(100);

  // Derive the unseen-alert count from alerts.data and the persisted visit
  // timestamp. Pure derivation — no setState-in-effect needed, the value
  // updates automatically when either the data refetches or the operator
  // visits /dashboard/alerts (which bumps lastAlertsVisit in the provider).
  const unseenAlertCount = useMemo(() => {
    if (!alerts.data || lastAlertsVisit === 0) return 0;
    return alerts.data.filter((a) => {
      if (a.listing_status === "hidden") return false;
      const t = new Date(a.sent_at).getTime();
      return Number.isFinite(t) && t > lastAlertsVisit;
    }).length;
  }, [alerts.data, lastAlertsVisit]);

  // The sidebar is a true modal drawer only on narrow viewports — on desktop
  // it's a static aside. Engage the focus trap only when both conditions hold,
  // otherwise tabbing through normal dashboard content would loop unexpectedly.
  const isMobile = useMediaQuery("(max-width: 1023.98px)");
  const trapActive = Boolean(isMobile && open);
  const drawerRef = useFocusTrap<HTMLElement>(trapActive, onClose);

  return (
    <aside
      ref={drawerRef}
      role={trapActive ? "dialog" : undefined}
      aria-modal={trapActive ? true : undefined}
      aria-label={trapActive ? "Navigation" : undefined}
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
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid h-9 w-9 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-elev)] lg:hidden"
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
          const showWarningDot = item.to === "/dashboard/settings" && emailUnconfigured;
          const showPulse = item.to === "/dashboard/alerts" && unseenAlertCount > 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-elev)]",
                active
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]",
              )}
              aria-label={
                showPulse
                  ? `${item.label} (${unseenAlertCount} new)`
                  : item.label
              }
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {showWarningDot && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                )}
                {showPulse && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse-accent" />
                )}
              </span>
              {item.label}
              {showPulse ? (
                <span className="ml-auto rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-bg-base)]">
                  {unseenAlertCount}
                </span>
              ) : null}
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
