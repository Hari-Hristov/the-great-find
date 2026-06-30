// Shared wizard shell — header (step pill), body slot, footer.
// All four wizard steps render inside this container.
//
// Respects prefers-reduced-motion: the brand intro can opt into a single
// fade-in but no looping decoration.

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

interface WizardShellProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideFooter?: boolean;
  isLast?: boolean;
}

export function WizardShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  onSkip,
  nextLabel,
  nextDisabled,
  hideFooter,
  isLast,
}: WizardShellProps) {
  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)] flex flex-col">
      <header className="px-8 pt-10 pb-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          <span>{String(step).padStart(2, "0")}</span>
          <span className="text-[var(--color-border-subtle)]">/</span>
          <span>{String(totalSteps).padStart(2, "0")}</span>
          <span className="mx-2 h-px flex-1 bg-[var(--color-border-subtle)]" />
          <span>Setup</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-[var(--color-text-muted)] max-w-prose">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div className="flex-1 px-8 pb-10 max-w-3xl w-full mx-auto">
        {children}
      </div>

      {!hideFooter ? (
        <footer className="px-8 py-6 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
          <div>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {onSkip ? (
              <Button variant="ghost" onClick={onSkip}>
                Skip for now
              </Button>
            ) : null}
            {onNext ? (
              <Button onClick={onNext} disabled={nextDisabled}>
                {nextLabel ?? (isLast ? "Done" : "Next")}
                {isLast ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
