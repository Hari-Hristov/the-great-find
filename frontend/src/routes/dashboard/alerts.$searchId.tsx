import { createFileRoute, useParams } from "@tanstack/react-router";
import { EyeOff, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAlerts, useHideListing, useSearches, useTagAlert } from "@/api/hooks/queries";
import { formatEUR, relativeTime } from "@/lib/utils";
import { TAG_COLORS, tagBg, type TagColorName } from "@/lib/tagColors";
import type { Alert } from "@/api/types";

export const Route = createFileRoute("/dashboard/alerts/$searchId")({
  component: AlertDetailPage,
});

function formatCriteria(raw: string): string {
  try {
    const c = JSON.parse(raw) as { kind?: string; price_eur?: number };
    if (c.kind === "price_below" && c.price_eur != null) {
      return `≤ ${formatEUR(c.price_eur)}`;
    }
  } catch { /* ignore */ }
  return raw;
}

function TagPopover({
  alertId,
  currentLabel,
  currentColor,
}: {
  alertId: number;
  currentLabel?: string;
  currentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentLabel ?? "");
  const [draftColor, setDraftColor] = useState<TagColorName>(
    (currentColor as TagColorName | undefined) ?? "blue",
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const tag = useTagAlert();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function save() {
    const label = draft.trim();
    if (!label) return;
    tag.mutate({ id: alertId, label, color: draftColor }, { onSuccess: () => setOpen(false) });
  }

  function clear() {
    tag.mutate({ id: alertId, label: "", color: "" });
  }

  return (
    <div className="relative flex items-center gap-1">
      {currentLabel ? (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${tagBg(currentColor)}`}
        >
          {currentLabel}
          <button
            aria-label="Remove tag"
            disabled={tag.isPending}
            onClick={clear}
            className="ml-0.5 opacity-70 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : null}

      <Button
        size="icon"
        variant="ghost"
        aria-label="Add tag"
        onClick={() => {
          setDraft(currentLabel ?? "");
          setDraftColor((currentColor as TagColorName | undefined) ?? "blue");
          setOpen((v) => !v);
        }}
        className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
      >
        <Tag className="h-4 w-4" />
      </Button>

      {open ? (
        <div
          ref={popoverRef}
          className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-lg"
        >
          <input
            autoFocus
            type="text"
            maxLength={100}
            placeholder="Label…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="mt-2 flex gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c.name}
                aria-label={c.name}
                onClick={() => setDraftColor(c.name)}
                className={`h-5 w-5 rounded-full ${c.bg} ring-offset-1 transition-all ${draftColor === c.name ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={!draft.trim() || tag.isPending}
              onClick={save}
              className="flex-1"
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlertDetailPage() {
  const { searchId: searchIdParam } = useParams({ from: "/dashboard/alerts/$searchId" });
  const searchId = Number(searchIdParam);

  const alerts = useAlerts(200);
  const searches = useSearches();
  const hide = useHideListing();

  const search = (searches.data ?? []).find((s) => s.id === searchId);

  const items = (alerts.data ?? [])
    .filter((a) => a.search_id === searchId && a.listing_status !== "hidden")
    .sort((a, b) => {
      // Active alerts first, then removed/sold, within each group by date desc.
      const aRemoved = a.listing_status !== "active";
      const bRemoved = b.listing_status !== "active";
      if (aRemoved !== bRemoved) return aRemoved ? 1 : -1;
      return b.sent_at.localeCompare(a.sent_at);
    });

  return (
    <>
      <Topbar
        title={search?.name ?? `Search #${searchId}`}
        subtitle={`${items.filter((a) => a.listing_status === "active").length} alert${items.filter((a) => a.listing_status === "active").length === 1 ? "" : "s"}`}
        back={{ to: "/dashboard/alerts", label: "Back to alerts" }}
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {alerts.isLoading || searches.isLoading ? (
          <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            No alerts for this search.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {items.map((a: Alert) => (
              <li key={a.id} className={`flex items-center justify-between py-3 ${a.listing_status !== "active" ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1 pr-4">
                  {a.listing_url ? (
                    <a
                      href={a.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm hover:text-[var(--color-accent)]"
                    >
                      {a.listing_title ?? a.listing_url}
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--color-text-muted)]">
                      #{a.listing_id}
                    </span>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <span>{relativeTime(a.sent_at)}</span>
                    <Badge variant="secondary" className="font-mono">
                      {formatCriteria(a.criteria)}
                    </Badge>
                    {a.listing_status !== "active" && (
                      <Badge variant="secondary" className="text-[var(--color-text-muted)]">
                        No longer listed
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <TagPopover
                    alertId={a.id}
                    currentLabel={a.tag_label}
                    currentColor={a.tag_color}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Hide listing"
                    disabled={hide.isPending}
                    onClick={() => hide.mutate(a.listing_id)}
                    className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
