import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Menu } from "lucide-react";
import { useEventStreamContext } from "@/contexts/EventStreamContext";
import { useSidebarContext } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  subtitle?: string;
  back?: { to?: string; onClick?: () => void; label?: string };
  actions?: React.ReactNode;
  onMenuClick?: () => void;
}

export function Topbar({ title, subtitle, back, actions, onMenuClick }: TopbarProps) {
  const { connected, polling } = useEventStreamContext();
  const sidebarCtx = useSidebarContext();
  const menuClick = onMenuClick ?? sidebarCtx?.openSidebar;

  const statusLabel = !connected
    ? "Disconnected"
    : polling
      ? "Polling listings"
      : "Live";

  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-6 py-4">
      <div className="flex items-center gap-3">
        {menuClick && (
          <button
            type="button"
            onClick={menuClick}
            aria-label="Open menu"
            className="grid h-9 w-9 place-items-center rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        {back ? (
          back.onClick ? (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label ?? "Back"}
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : back.to ? (
            <Link
              to={back.to}
              aria-label={back.label ?? "Back"}
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          ) : null
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
        <div
          className="flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs"
          role="status"
          aria-live="polite"
        >
          {connected && polling ? (
            <Loader2
              aria-hidden
              className="h-3 w-3 animate-spin text-[var(--color-accent)]"
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-full",
                connected
                  ? "bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]"
                  : "bg-[var(--color-danger)]",
              )}
            />
          )}
          <span className="text-[var(--color-text-muted)]">{statusLabel}</span>
        </div>
      </div>
    </header>
  );
}
