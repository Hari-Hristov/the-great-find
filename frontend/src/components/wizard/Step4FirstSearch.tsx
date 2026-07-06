// Step 4 — create the first saved search.
//
// Wraps the existing SearchForm. On success we persist the setup-completed
// flag through the Electron bridge (browser dev has no bridge — the flag
// isn't relevant there) and then exit to the dashboard.

import { useNavigate } from "@tanstack/react-router";
import { SearchForm } from "@/components/SearchForm";
import { WizardShell } from "./WizardShell";

interface Props {
  onBack: () => void;
}

export function Step4FirstSearch({ onBack }: Props) {
  const navigate = useNavigate();
  const bridge = typeof window !== "undefined" ? window.tgf : undefined;

  return (
    <WizardShell
      step={4}
      totalSteps={4}
      title="Your first search."
      subtitle="Name it, point it at an olx.bg category, set a target price if you want one. You can add more, edit, and tune later."
      onBack={onBack}
      hideFooter
      isLast
    >
      <div className="mt-4 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-5">
        <SearchForm
          mode="create"
          onSuccess={async () => {
            await bridge?.setSetupCompleted(true);
            void navigate({ to: "/dashboard" });
          }}
          onCancel={onBack}
        />
      </div>
    </WizardShell>
  );
}
