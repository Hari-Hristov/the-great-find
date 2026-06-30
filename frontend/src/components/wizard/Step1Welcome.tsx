// Step 1 — welcome screen. Brand intro per PRODUCT.md tone: cinematic,
// playful, personal-use. No SaaS energy.

import { WizardShell } from "./WizardShell";

interface Props {
  onNext: () => void;
}

export function Step1Welcome({ onNext }: Props) {
  return (
    <WizardShell
      step={1}
      totalSteps={4}
      title="Welcome, operator."
      subtitle="The Great Find is a personal price scout for olx.bg. It runs locally on this machine — no cloud, no account, no telemetry. Just a quiet pair of eyes on the listings you care about."
      onNext={onNext}
      nextLabel="Get started"
    >
      <div className="grid gap-4 mt-6">
        <Bullet
          k="01"
          title="Polls in the background"
          body="Every saved search ticks on its own schedule (default 30 min). Close the window — the scout keeps watching from the tray."
        />
        <Bullet
          k="02"
          title="Fires alerts that matter"
          body="Price drops, keyword matches, listings under your target — surfaced as OS notifications and a live feed in the dashboard."
        />
        <Bullet
          k="03"
          title="Yours and yours alone"
          body="The database lives in a folder on your disk. You can move it, back it up, or wipe it. No part of this app phones home."
        />
      </div>
    </WizardShell>
  );
}

function Bullet({ k, title, body }: { k: string; title: string; body: string }) {
  return (
    <div className="flex gap-4 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
      <div className="font-mono text-xs tabular-nums text-[var(--color-text-muted)] pt-0.5">
        {k}
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-sm text-[var(--color-text-muted)]">{body}</div>
      </div>
    </div>
  );
}
