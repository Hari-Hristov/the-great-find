import { useMemo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EyeOff, Tag, X } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAlerts, useAnalytics, useHideListing, useSearches, useTagAlert } from "@/api/hooks/queries";
import { formatEUR, relativeTime, safeJSONParse } from "@/lib/utils";
import { safeHref } from "@/lib/url";
import { TAG_COLORS, tagBg, type TagColorName } from "@/lib/tagColors";
import type { Alert, SavedSearch } from "@/api/types";
import { useWindowNav } from "@/contexts/DesktopContext";

function formatDayHeading(isoDay: string): string {
  if (!isoDay) return "—";
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (isoDay === todayKey) return "Today";
  if (isoDay === yesterday) return "Yesterday";
  const d = new Date(isoDay);
  if (Number.isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function searchIdFromRoute(route: string): string | null {
  const m = route.match(/^\/dashboard\/alerts\/(\d+)/);
  return m ? m[1] : null;
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });
  const tag = useTagAlert();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
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

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: popoverPos.top, right: popoverPos.right, zIndex: 9001 }}
          className="w-56 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] p-3 shadow-lg"
        >
          <input
            autoFocus
            type="text"
            maxLength={100}
            placeholder="Label…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setOpen(false);
            }}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="mt-2 flex gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c.name}
                aria-label={c.name}
                onClick={() => setDraftColor(c.name)}
                className={`h-5 w-5 rounded-full ${c.bg} ring-offset-[var(--color-bg-elev)] transition-all ${draftColor === c.name ? "ring-2 ring-[var(--color-bg-base)]" : "opacity-70 hover:opacity-100"}`}
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
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative flex items-center gap-1">
      {currentLabel ? (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-bg-base)] ${tagBg(currentColor)}`}
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
        ref={buttonRef}
        size="icon"
        variant="ghost"
        aria-label="Add tag"
        onClick={() => {
          setDraft(currentLabel ?? "");
          setDraftColor((currentColor as TagColorName | undefined) ?? "blue");
          if (open) {
            setOpen(false);
            return;
          }
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPopoverPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
          }
          setOpen(true);
        }}
        className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
      >
        <Tag className="h-4 w-4" />
      </Button>

      {popover}
    </div>
  );
}

function PriceContext({
  alert,
  targetEur,
}: {
  alert: Alert;
  targetEur?: number;
}) {
  const analytics = useAnalytics(alert.search_id, 30, undefined, undefined, "active");
  const avg = analytics.data?.avg_eur;
  const price = alert.listing_price_eur;
  const deltaPct =
    price != null && avg && avg > 0 ? ((price - avg) / avg) * 100 : null;
  const belowTarget = targetEur != null && price != null && price <= targetEur;

  return (
    <div className="text-right font-mono tabular-nums">
      {price != null ? (
        <div
          className={
            "text-base font-semibold " +
            (belowTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]")
          }
        >
          {formatEUR(price)}
        </div>
      ) : null}
      {deltaPct != null ? (
        <div
          className={
            "text-[11px] " +
            (deltaPct < 0 ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]")
          }
        >
          {deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(0)}% vs 30d avg
        </div>
      ) : avg != null && avg > 0 ? (
        <div className="text-[11px] text-[var(--color-text-muted)]">30d avg {formatEUR(avg)}</div>
      ) : null}
      {targetEur != null ? (
        <div className="text-[10px] text-[var(--color-text-muted)]">target ≤ {formatEUR(targetEur)}</div>
      ) : null}
    </div>
  );
}

function AlertRow({
  alert,
  search,
  onHide,
  hideIsPending,
}: {
  alert: Alert;
  search?: SavedSearch;
  onHide: (listingId: number) => void;
  hideIsPending: boolean;
}) {
  const criteria = safeJSONParse<{ kind?: string; price_eur?: number }>(alert.criteria, {});
  const targetPrice = criteria.kind === "price_below" ? criteria.price_eur : undefined;
  const isInactive = alert.listing_status !== "active";

  return (
    <li className={`flex items-center justify-between gap-4 px-4 py-3 ${isInactive ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        {alert.listing_url ? (
          <a
            href={safeHref(alert.listing_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
          >
            {alert.listing_title ?? alert.listing_url}
          </a>
        ) : (
          <span className="text-sm text-[var(--color-text-muted)]">#{alert.listing_id}</span>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          {alert.tag_label ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-bg-base)] ${tagBg(alert.tag_color)}`}
            >
              {alert.tag_label}
            </span>
          ) : null}
          {search ? <span className="truncate">{search.name}</span> : null}
          <span>{relativeTime(alert.sent_at)}</span>
          <Badge variant="secondary" className="font-mono">
            {criteria.kind === "price_below" && criteria.price_eur != null
              ? `≤ ${formatEUR(criteria.price_eur)}`
              : alert.criteria}
          </Badge>
          {isInactive && (
            <Badge variant="secondary" className="text-[var(--color-text-muted)]">
              No longer listed
            </Badge>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <PriceContext alert={alert} targetEur={targetPrice} />
        <div className="flex items-center gap-1">
          <TagPopover
            alertId={alert.id}
            currentLabel={alert.tag_label}
            currentColor={alert.tag_color}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Hide listing"
            disabled={hideIsPending}
            onClick={() => onHide(alert.listing_id)}
            className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function DayGroup({
  day,
  items,
  search,
  onHide,
  hideIsPending,
}: {
  day: string;
  items: Alert[];
  search?: SavedSearch;
  onHide: (listingId: number) => void;
  hideIsPending: boolean;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {formatDayHeading(day)}
      </h3>
      <ul className="divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]">
        {items.map((a) => (
          <AlertRow
            key={a.id}
            alert={a}
            search={search}
            onHide={onHide}
            hideIsPending={hideIsPending}
          />
        ))}
      </ul>
    </div>
  );
}

export function AlertDetailPage() {
  const nav = useWindowNav("alerts");
  const searchId = Number(searchIdFromRoute(nav.current) ?? "0");

  const alerts = useAlerts(200);
  const searches = useSearches();
  const hide = useHideListing();

  const search = useMemo(
    () => (searches.data ?? []).find((s) => s.id === searchId),
    [searches.data, searchId],
  );

  const items = useMemo(
    () =>
      (alerts.data ?? [])
        .filter((a) => a.search_id === searchId && a.listing_status !== "hidden")
        .sort((a, b) => {
          const aRemoved = a.listing_status !== "active";
          const bRemoved = b.listing_status !== "active";
          if (aRemoved !== bRemoved) return aRemoved ? 1 : -1;
          return b.sent_at.localeCompare(a.sent_at);
        }),
    [alerts.data, searchId],
  );

  const groups = useMemo(() => {
    const buckets = new Map<string, Alert[]>();
    for (const a of items) {
      const day = (a.sent_at || "").slice(0, 10);
      const arr = buckets.get(day) ?? [];
      arr.push(a);
      buckets.set(day, arr);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, dayItems]) => ({ day, items: dayItems }));
  }, [items]);

  const isLoading = alerts.isLoading || searches.isLoading;

  const emptyMessage =
    search?.active === false
      ? "This search is paused — re-enable it to start receiving alerts."
      : "No alerts yet — the scheduler will notify you when listings match.";

  return (
    <>
      <Topbar
        title={search?.name ?? `Search #${searchId}`}
        subtitle={`${items.length} alert${items.length === 1 ? "" : "s"}`}
        back={{ onClick: () => nav.pop(), label: "Back to alerts" }}
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">Alerts</h2>

          {isLoading ? (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
              </CardContent>
            </Card>
          ) : groups.length === 0 ? (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-[var(--color-text-primary)]">No alerts here.</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{emptyMessage}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map(({ day, items: dayItems }) => (
                <DayGroup
                  key={day}
                  day={day}
                  items={dayItems}
                  search={search}
                  onHide={(id) => hide.mutate(id)}
                  hideIsPending={hide.isPending}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
