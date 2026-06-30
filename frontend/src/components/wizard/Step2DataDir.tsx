// Step 2 — pick / confirm data directory.
//
// In Electron, we read the current configured override (if any) and let the
// user pick a different folder. The change is persisted to the Electron
// config file and applies on next launch — we do not restart the sidecar
// mid-wizard because that would race with the very query that gated the
// wizard in the first place. In browser-only dev, the controls are
// disabled with a hint.

import { useEffect, useState } from "react";
import { Folder, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardShell } from "./WizardShell";

interface Props {
  onBack: () => void;
  onNext: () => void;
}

const PLATFORM_DEFAULTS: Record<string, string> = {
  win32: "%APPDATA%\\the-great-find\\",
  darwin: "~/Library/Application Support/the-great-find/",
  linux: "$XDG_DATA_HOME/the-great-find/",
};

export function Step2DataDir({ onBack, onNext }: Props) {
  const bridge = typeof window !== "undefined" ? window.tgf : undefined;
  const isElectron = !!bridge?.isElectron;
  const [override, setOverride] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void bridge?.getDataDir().then((d) => setOverride(d));
  }, [bridge]);

  const pick = async () => {
    const picked = await bridge?.pickDirectory();
    if (picked) {
      setOverride(picked);
      setDirty(true);
    }
  };

  const save = async () => {
    if (override && dirty) {
      await bridge?.setDataDir(override);
    }
    onNext();
  };

  const platformDefault =
    PLATFORM_DEFAULTS[
      typeof navigator !== "undefined" && navigator.platform.toLowerCase().startsWith("win")
        ? "win32"
        : typeof navigator !== "undefined" && navigator.platform.toLowerCase().startsWith("mac")
          ? "darwin"
          : "linux"
    ] ?? "";

  return (
    <WizardShell
      step={2}
      totalSteps={4}
      title="Where the database lives."
      subtitle="A SQLite file holds your searches, listings and alerts. By default it goes into the OS-conventional app data folder."
      onBack={onBack}
      onNext={save}
      onSkip={isElectron ? undefined : onNext}
      nextLabel="Continue"
    >
      <div className="mt-4 space-y-4">
        <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-start gap-3">
            <Folder className="h-5 w-5 mt-0.5 text-[var(--color-text-muted)]" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Default
              </div>
              <code className="block text-sm mt-1 break-all">{platformDefault}</code>
            </div>
          </div>
        </div>

        {isElectron ? (
          <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
            <div className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              Override
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="text-sm break-all flex-1 min-w-[200px]">
                {override ?? "— (using default)"}
              </code>
              <Button variant="secondary" size="sm" onClick={pick}>
                Choose folder…
              </Button>
            </div>
            {dirty ? (
              <p className="mt-3 text-xs text-amber-400">
                Applies on next launch. Your current data stays in its existing location.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]/50 p-4 text-sm text-[var(--color-text-muted)]">
            <div className="flex items-start gap-2">
              <ExternalLink className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Folder selection is a desktop-only feature. In browser dev mode
                the backend uses{" "}
                <code className="text-[var(--color-text-primary)]">
                  THE_GREAT_FIND_DATA_DIR
                </code>{" "}
                from the environment.
              </div>
            </div>
          </div>
        )}
      </div>
    </WizardShell>
  );
}
