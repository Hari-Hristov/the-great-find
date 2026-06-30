import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { X } from "lucide-react";
import { Desktop } from "@/components/desktop/Desktop";
import { useNotificationSettings } from "@/api/hooks/queries";
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

function DashboardLayout() {
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const { data: notifSettings, isSuccess } = useNotificationSettings();
  const { openWindow, focusWindow, windows } = useDesktop();

  const [entered] = useState(() => {
    const flag = sessionStorage.getItem("desktop-entered") === "1";
    if (flag) sessionStorage.removeItem("desktop-entered");
    return flag;
  });

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
