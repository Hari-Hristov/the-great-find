// Step 4 — create the first saved search.
//
// Wraps the existing SearchForm. On success the wizard exits and the
// dashboard's render gate sees a non-empty searches list, so navigation
// to /dashboard goes through cleanly.

import { useNavigate } from "@tanstack/react-router";
import { SearchForm } from "@/components/SearchForm";
import { WizardShell } from "./WizardShell";

interface Props {
  onBack: () => void;
}

export function Step4FirstSearch({ onBack }: Props) {
  const navigate = useNavigate();

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
          onSuccess={() => {
            void navigate({ to: "/dashboard" });
          }}
          onCancel={onBack}
        />
      </div>
    </WizardShell>
  );
}
