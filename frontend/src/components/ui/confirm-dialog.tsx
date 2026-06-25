import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  /**
   * When set, the operator must type this string verbatim before the confirm
   * button enables. Used as a friction gate proportional to destructiveness;
   * e.g. typing the search name to delete it.
   */
  requireTyping?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tone of the confirm button; defaults to `destructive`. */
  tone?: "destructive" | "default";
  /** Pending state — disables interaction and dims the confirm button. */
  pending?: boolean;
}

/**
 * Confirmation modal for destructive or irreversible actions. Replaces native
 * `confirm()` and adds a typed-name friction gate proportional to the
 * destructiveness of the deed. Focus is trapped while open; Esc and backdrop
 * click both dismiss; focus returns to the trigger on close.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  // Mount the body component only while `open` is true — that's the cleanest
  // way to reset the typed-confirmation input on each new open. State that
  // belongs to a single "session" of a dialog lives on the body, not the host.
  if (!props.open) return null;
  return <ConfirmDialogBody {...props} />;
}

function ConfirmDialogBody({
  onClose,
  onConfirm,
  title,
  description,
  requireTyping,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "destructive",
  pending = false,
}: ConfirmDialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, pending ? undefined : onClose);
  const [typed, setTyped] = React.useState("");
  const titleId = React.useId();
  const descId = React.useId();
  const typedId = React.useId();

  const gated = requireTyping !== undefined && typed.trim() !== requireTyping;
  const accentClass = tone === "destructive"
    ? "bg-[var(--color-danger)]"
    : "bg-[var(--color-accent)]";

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="w-full max-w-md overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={cn("h-2 w-2 rounded-full", accentClass)} aria-hidden />
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {description ? (
            <div id={descId} className="text-sm leading-relaxed text-[var(--color-text-muted)]">
              {description}
            </div>
          ) : null}

          {requireTyping !== undefined ? (
            <div className="space-y-1.5">
              <label
                htmlFor={typedId}
                className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                Type <span className="text-[var(--color-text-primary)] font-mono normal-case tracking-normal">{requireTyping}</span> to confirm
              </label>
              <input
                id={typedId}
                type="text"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !gated && !pending) onConfirm();
                }}
                disabled={pending}
                className="h-9 w-full rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 font-mono text-sm text-[var(--color-text-primary)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={gated || pending}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
