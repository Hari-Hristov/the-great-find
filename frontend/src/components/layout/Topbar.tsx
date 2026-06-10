import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEventStream } from "@/api/hooks/useEventStream";
import { cn, relativeTime } from "@/lib/utils";

interface TopbarProps {
  title: string;
  subtitle?: string;
  back?: { to: string; label?: string };
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, back, actions }: TopbarProps) {
  const { connected, last } = useEventStream();

  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-6 py-4">
      <div className="flex items-center gap-3">
        {back ? (
          <Link
            to={back.to}
            aria-label={back.label ?? "Back"}
            className="grid h-9 w-9 place-items-center rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected
                ? "bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]"
                : "bg-[var(--color-danger)]",
            )}
          />
          <span className="text-[var(--color-text-muted)]">
            {connected ? "Live" : "Disconnected"}
          </span>
          {last ? (
            <span className="text-[var(--color-text-muted)] opacity-70">
              · {last.name} · {relativeTime(new Date(last.receivedAt).toISOString())}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
