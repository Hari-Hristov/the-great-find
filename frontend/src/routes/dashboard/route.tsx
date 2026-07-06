import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Desktop } from "@/components/desktop/Desktop";
import { useNotificationSettings, useSearches } from "@/api/hooks/queries";
import { useDesktop } from "@/contexts/DesktopContext";

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

// Tri-state: undefined = still loading (or browser dev, treat as "not gating"),
// false = wizard has never completed, true = wizard already completed.
type SetupState = boolean | undefined;

function DashboardLayout() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const { data: notifSettings, isSuccess } = useNotificationSettings();
  const { openWindow, focusWindow, windows } = useDesktop();

  const bridge = typeof window !== "undefined" ? window.tgf : undefined;
  // Browser-only dev has no persisted flag. Treat it as "not yet completed"
  // so the wizard-empty-search flow can still be exercised there; the
  // backfill effect below is a no-op without a bridge.
  const [setupCompleted, setSetupCompleted] = useState<SetupState>(
    bridge ? undefined : false,
  );
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.getSetupCompleted().then((done) => {
      if (!cancelled) setSetupCompleted(done);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // First-run gate: if the wizard has never been marked complete AND the
  // searches list is empty, punt to the wizard. Gated on !isFetching so we
  // don't redirect on the stale-cache render that fires immediately after
  // Step 4 creates a search (React Query has invalidated but the refetch is
  // still in flight; without this guard the dashboard would bounce the user
  // back to Step 1 before the new data lands).
  //
  // The persisted flag is what makes the gate durable across launches — the
  // old behaviour relied purely on searchesEmpty, which flipped back to true
  // whenever the dataDir override applied on next launch (or the user
  // manually deleted their only search).
  const searches = useSearches();
  const searchesEmpty =
    searches.isSuccess && !searches.isFetching && (searches.data?.length ?? 0) === 0;
  const shouldShowWizard = setupCompleted === false && searchesEmpty;
  useEffect(() => {
    if (shouldShowWizard) {
      void navigate({ to: "/wizard", replace: true });
    }
  }, [shouldShowWizard, navigate]);

  // Backfill for users who set up before the flag existed: if they clearly
  // have data (a non-empty searches list) but no flag, mark setup complete
  // so a stray delete-all-searches doesn't strand them in the wizard. The
  // state update sits inside the promise callback (not the effect body) so
  // react-hooks/set-state-in-effect doesn't flag it as a cascading render.
  useEffect(() => {
    if (
      !bridge ||
      setupCompleted !== false ||
      !searches.isSuccess ||
      (searches.data?.length ?? 0) === 0
    ) {
      return;
    }
    let cancelled = false;
    void bridge.setSetupCompleted(true).then(() => {
      if (!cancelled) setSetupCompleted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, setupCompleted, searches.isSuccess, searches.data]);

  const [entered] = useState(() => {
    const flag = sessionStorage.getItem("desktop-entered") === "1";
    if (flag) sessionStorage.removeItem("desktop-entered");
    return flag;
  });

  // While we don't yet know whether searches exist (or the setup flag is
  // still resolving), render nothing — avoids a flash of the empty desktop
  // before the redirect resolves.
  if (searches.isLoading || setupCompleted === undefined) return null;
  if (shouldShowWizard) return null;

  const showPopup = isSuccess && !dismissed && !notifSettings?.smtp_host;

  function dismiss() {
    localStorage.setItem(EMAIL_DISMISSED_KEY, String(Date.now() + DISMISS_DURATION_MS));
    setDismissed(true);
  }

  function goToSettings() {
    const settings = windows.find((w) => w.id === "settings");
    if (settings?.open) {
      focusWindow("settings");
    } else {
      openWindow("settings");
    }
    dismiss();
  }

  return (
    <>
      <Desktop entered={entered} />

      {showPopup && (
        <div className="fixed bottom-14 right-5 z-[9990] flex items-center gap-2 rounded-full border border-amber-500/30 bg-[var(--color-bg-elev)]/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={goToSettings}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-xs text-[var(--color-text-muted)]">Email alerts not configured</span>
          </button>
          <button
            onClick={dismiss}
            className="ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </>
  );
}
