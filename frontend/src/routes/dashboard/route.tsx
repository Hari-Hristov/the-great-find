import { Outlet, createFileRoute, useRouterState, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarContext } from "@/contexts/SidebarContext";
import { useEventStreamContext } from "@/contexts/EventStreamContext";
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const { data: notifSettings, isSuccess } = useNotificationSettings();
  const { connected } = useEventStreamContext();

  const sidebarCtx = useMemo(() => ({ openSidebar: () => setSidebarOpen(true) }), []);

  const showPopup = isSuccess && !dismissed && !notifSettings?.smtp_host;

  function dismiss() {
    localStorage.setItem(EMAIL_DISMISSED_KEY, String(Date.now() + DISMISS_DURATION_MS));
    setDismissed(true);
  }

  return (
    <div className="flex h-full w-full bg-[var(--color-bg-base)]">
      {!hideSidebar && (
        <>
          {/* Backdrop — mobile/tablet only */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/50 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <Sidebar
            emailUnconfigured={isSuccess && !notifSettings?.smtp_host}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </>
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        <SidebarContext.Provider value={sidebarCtx}>
          {!connected ? <DisconnectBanner /> : null}
          <Outlet />
        </SidebarContext.Provider>
      </main>

      {showPopup && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-[var(--color-warning)] bg-[var(--color-bg-elev)] px-3 py-1.5 shadow-lg">
          <Link
            to="/dashboard/settings"
            onClick={dismiss}
            className="flex items-center gap-2 rounded-full px-1 transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
            <span className="text-xs text-[var(--color-text-muted)]">Email alerts not configured</span>
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="ml-1 grid h-5 w-5 place-items-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Banner that appears below the topbar whenever the SSE connection is down.
 * The audit + critique called out that "Disconnected" alone gives the
 * operator no recovery path; this names what's broken, the live polling
 * cadence still in play, and the recovery action. Quiet but visually
 * distinct via a danger-tinted left border — no costume, just signal.
 */
function DisconnectBanner() {
  return (
    <div className="px-6 pt-4" role="status" aria-live="polite">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--color-danger)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Event bus offline
          </h2>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <BannerRow
            label="Symptom"
            value="Live updates are not arriving. The backend stopped streaming events to the dashboard."
          />
          <BannerRow
            label="Cadence"
            value="Background polling continues every 30 minutes — only real-time push is affected."
          />
          <BannerRow
            label="Recover"
            value="Reopen the tray app, or restart the backend binary. Reconnects auto-retry with exponential backoff."
          />
        </dl>
      </div>
    </div>
  );
}

function BannerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
