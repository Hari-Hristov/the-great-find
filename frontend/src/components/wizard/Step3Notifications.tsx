// Step 3 — notifications.
//
// OS notifications: stored as an Electron config flag + we request browser
// notification permission as a fallback for browser-only dev.
//
// SMTP: deferred. The settings screen already has the full SMTP form; the
// wizard just nudges the user toward it after onboarding.

import { useEffect, useState } from "react";
import { Bell, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardShell } from "./WizardShell";

interface Props {
  onBack: () => void;
  onNext: () => void;
}

type PermState = "default" | "granted" | "denied" | "unknown";

export function Step3Notifications({ onBack, onNext }: Props) {
  const bridge = typeof window !== "undefined" ? window.tgf : undefined;
  const [enabled, setEnabled] = useState(true);
  const [perm, setPerm] = useState<PermState>(() => readPerm());

  useEffect(() => {
    void bridge?.getOsNotifications().then((v) => setEnabled(v));
  }, [bridge]);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    await bridge?.setOsNotifications(next);
  };

  const requestPerm = async () => {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setPerm((r as PermState) ?? "default");
  };

  return (
    <WizardShell
      step={3}
      totalSteps={4}
      title="How should it tell you?"
      subtitle="The scout's only job is to notify you when something interesting happens. Pick how loud it should be."
      onBack={onBack}
      onNext={onNext}
      onSkip={onNext}
      nextLabel="Continue"
    >
      <div className="mt-4 space-y-4">
        <ToggleCard
          icon={<Bell className="h-5 w-5" />}
          title="OS notifications"
          body="Native toast each time an alert fires. Counts as the default delivery channel."
          value={enabled}
          onToggle={toggle}
        />

        {enabled && perm !== "granted" ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <div className="text-amber-400 font-medium mb-1">
              Notifications permission {perm === "denied" ? "blocked" : "needed"}
            </div>
            <div className="text-[var(--color-text-muted)]">
              {perm === "denied"
                ? "Your OS is blocking notifications from this app. Enable them in system settings."
                : "Grant permission so the scout can actually surface alerts."}
            </div>
            {perm !== "denied" ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={requestPerm}
              >
                Grant permission
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 mt-0.5 text-[var(--color-text-muted)]" />
            <div className="flex-1">
              <div className="text-sm font-medium">Email alerts (optional)</div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                Mirror every alert to an inbox of your choice. Needs an SMTP
                server you control. You can wire this up later from the
                Settings panel — skipping this is fine.
              </div>
            </div>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}

function readPerm(): PermState {
  if (typeof Notification === "undefined") return "unknown";
  return Notification.permission as PermState;
}

function ToggleCard({
  icon,
  title,
  body,
  value,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  value: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4 cursor-pointer">
      <div className="text-[var(--color-text-muted)] mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-sm text-[var(--color-text-muted)]">{body}</div>
      </div>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
      />
    </label>
  );
}
