// /wizard — top-level first-run flow. Sits outside the dashboard so it can
// render before the desktop windowing system mounts.
//
// The dashboard route owns the gating logic — if a user lands on /dashboard
// with an empty searches list they get bounced here. Once a search is
// created (Step 4), the user is navigated back to /dashboard and the gate
// passes through.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Step1Welcome } from "@/components/wizard/Step1Welcome";
import { Step2DataDir } from "@/components/wizard/Step2DataDir";
import { Step3Notifications } from "@/components/wizard/Step3Notifications";
import { Step4FirstSearch } from "@/components/wizard/Step4FirstSearch";

export const Route = createFileRoute("/wizard")({
  component: WizardPage,
});

function WizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  switch (step) {
    case 1:
      return <Step1Welcome onNext={() => setStep(2)} />;
    case 2:
      return (
        <Step2DataDir
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      );
    case 3:
      return (
        <Step3Notifications
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      );
    case 4:
      return <Step4FirstSearch onBack={() => setStep(3)} />;
    default:
      void navigate({ to: "/dashboard" });
      return null;
  }
}
