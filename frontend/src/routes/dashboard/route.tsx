import { Outlet, createFileRoute, useRouterState, Link } from "@tanstack/react-router";
import { useState } from "react";
import { X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useNotificationSettings } from "@/api/hooks/queries";

const EMAIL_DISMISSED_KEY = "email_setup_dismissed_until";
const DISMISS_DURATION_MS = 8 * 60 * 60 * 1000;

function isDismissed() {
  const until = localStorage.getItem(EMAIL_DISMISSED_KEY);
  if (!until) return false;
  return Date.now() < parseInt(until, 10);
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideSidebar = pathname === "/dashboard/searches/new";

  const [dismissed, setDismissed] = useState(() => isDismissed());
  const { data: notifSettings, isSuccess } = useNotificationSettings();

  const showPopup = isSuccess && !dismissed && !notifSettings?.smtp_host;

  function dismiss() {
    localStorage.setItem(EMAIL_DISMISSED_KEY, String(Date.now() + DISMISS_DURATION_MS));
    setDismissed(true);
  }

  return (
    <div className="flex h-full w-full bg-[var(--color-bg-base)]">
      {!hideSidebar && <Sidebar emailUnconfigured={isSuccess && !notifSettings?.smtp_host} />}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>

      {showPopup && (
        <Link
          to="/dashboard/settings"
          onClick={dismiss}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-amber-500/30 bg-[var(--color-bg-elev)]/90 px-3 py-1.5 shadow-lg backdrop-blur-sm transition-opacity hover:opacity-80"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-xs text-[var(--color-text-muted)]">Email alerts not configured</span>
          <button
            onClick={(e) => { e.preventDefault(); dismiss(); }}
            className="ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </Link>
      )}
    </div>
  );
}
