import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { useAlerts, useAnalytics, useSearches } from "@/api/hooks/queries";
import { useEventStreamContext } from "@/contexts/EventStreamContext";
import { formatEUR, relativeTime, safeJSONParse } from "@/lib/utils";
import { tagBg } from "@/lib/tagColors";
import type { Alert, SavedSearch } from "@/api/types";

const LAST_VISIT_KEY = "tgf-overview-last-visited";
const POLL_WINDOW_MS = 30 * 60 * 1000;

export function OverviewPage() {
  const searches = useSearches();
  const alerts = useAlerts(100);
  const { last: lastEvent } = useEventStreamContext();

  // "Now" ticks every 30s so the next-sweep countdown updates without forcing
  // a re-render storm. The value is initialised at mount via Date.now() in a
  // state initializer (lazy → idempotent per React 19's purity rules).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // The "new since last visit" line reads the previous-visit timestamp from
  // localStorage once at mount, then sticks for the rest of the session so the
  // operator sees a stable divider. The next mount writes a fresh timestamp.
  const [sinceLastVisit] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = window.localStorage.getItem(LAST_VISIT_KEY);
    return stored ? Number(stored) || 0 : 0;
  });
  useEffect(() => {
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  }, []);

  // Track which alert ids just arrived via the event stream this session — they
  // get the celebration highlight that fades on its own. Ref+state combo so
  // the highlight effect only fires for new arrivals, not on every refetch.
  const seenIds = useRef<Set<number>>(new Set());
  const [justArrived, setJustArrived] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (lastEvent?.name !== "alert.fired") return;
    const data = lastEvent.data as { id?: number } | string;
    const id = typeof data === "object" && data && "id" in data ? data.id : undefined;
    if (typeof id !== "number" || seenIds.current.has(id)) return;
    seenIds.current.add(id);
    setJustArrived((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const t = window.setTimeout(() => {
      setJustArrived((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1400);
    return () => window.clearTimeout(t);
  }, [lastEvent]);

  const visibleAlerts = useMemo(
    () =>
      (alerts.data ?? []).filter(
        (a) => !a.listing_status || a.listing_status === "active",
      ),
    [alerts.data],
  );

  const activeSearches = useMemo(
    () => (searches.data ?? []).filter((s) => s.active),
    [searches.data],
  );

  // Anchor the polling cadence on the most-recently polled active search so
  // the operator sees the next sweep coming. Backend polls each search on its
  // own clock, but the dashboard's "heartbeat" reads the earliest-due one.
  const { lastPollSummary, nextSweepIn } = useMemo(() => {
    const lastTimestamps = activeSearches
      .map((s) => (s.last_polled_at ? new Date(s.last_polled_at).getTime() : null))
      .filter((n): n is number => n !== null);
    if (lastTimestamps.length === 0) {
      return { lastPollSummary: "—", nextSweepIn: "—" };
    }
    const mostRecent = Math.max(...lastTimestamps);
    const earliestDue = Math.min(...lastTimestamps) + POLL_WINDOW_MS;
    const msUntilNext = Math.max(0, earliestDue - now);
    return {
      lastPollSummary: relativeTime(new Date(mostRecent).toISOString()),
      nextSweepIn: msUntilNext === 0 ? "due now" : formatDuration(msUntilNext),
    };
  }, [activeSearches, now]);

  return (
    <>
      <Topbar title="Overview" subtitle="What fired since you last looked" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <StatusStrip
          lastPoll={lastPollSummary}
          nextSweepIn={nextSweepIn}
          activeCount={activeSearches.length}
          totalCount={searches.data?.length ?? 0}
          alertCount={visibleAlerts.length}
        />

        <div className="mt-8">
          <AlertFeed
            alerts={visibleAlerts}
            searches={searches.data ?? []}
            sinceLastVisit={sinceLastVisit}
            justArrived={justArrived}
            loading={alerts.isLoading || searches.isLoading}
          />
        </div>
      </div>
    </>
  );
}

function StatusStrip({
  lastPoll,
  nextSweepIn,
  activeCount,
  totalCount,
  alertCount,
}: {
  lastPoll: string;
  nextSweepIn: string;
  activeCount: number;
  totalCount: number;
  alertCount: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[var(--color-border-subtle)] pb-4 md:grid-cols-4">
      <StatusCell label="Last sweep" value={lastPoll} />
      <StatusCell label="Next sweep" value={nextSweepIn} />
      <StatusCell
        label="Active searches"
        value={
          <>
            <span className="text-[var(--color-text-primary)]">{activeCount}</span>
            <span className="ml-1 text-[var(--color-text-muted)]">/ {totalCount}</span>
          </>
        }
      />
      <StatusCell label="Alerts in feed" value={alertCount.toString()} />
    </dl>
  );
}

function StatusCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
        {value}
      </dd>
    </div>
  );
}

interface AlertFeedProps {
  alerts: Alert[];
  searches: SavedSearch[];
  sinceLastVisit: number;
  justArrived: Set<number>;
  loading: boolean;
}

function AlertFeed({ alerts, searches, sinceLastVisit, justArrived, loading }: AlertFeedProps) {
  const searchMap = useMemo(() => new Map(searches.map((s) => [s.id, s])), [searches]);

  // Group by day; ordered most-recent first inside each day.
  const groups = useMemo(() => {
    const buckets = new Map<string, Alert[]>();
    for (const a of alerts) {
      const day = (a.sent_at || "").slice(0, 10);
      const arr = buckets.get(day) ?? [];
      arr.push(a);
      buckets.set(day, arr);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, items]) => ({
        day,
        items: items.sort((a, b) => b.sent_at.localeCompare(a.sent_at)),
      }));
  }, [alerts]);

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Alert feed</h2>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (groups.length === 0) {
    return <EmptyFeed />;
  }

  return (
    <section className="space-y-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">Alert feed</h2>
      {groups.map(({ day, items }) => (
        <DayGroup
          key={day}
          day={day}
          items={items}
          searchMap={searchMap}
          sinceLastVisit={sinceLastVisit}
          justArrived={justArrived}
        />
      ))}
    </section>
  );
}

function DayGroup({
  day,
  items,
  searchMap,
  sinceLastVisit,
  justArrived,
}: {
  day: string;
  items: Alert[];
  searchMap: Map<number, SavedSearch>;
  sinceLastVisit: number;
  justArrived: Set<number>;
}) {
  const heading = formatDayHeading(day);

  // Find the index of the first already-seen alert in this day. Any alert at
  // that index gets the "▾ already seen" divider rendered above it. Computed
  // outside the render loop so the map below stays pure (React 19 strict).
  const dividerIndex = useMemo(() => {
    if (sinceLastVisit === 0) return -1;
    return items.findIndex((a) => new Date(a.sent_at).getTime() <= sinceLastVisit);
  }, [items, sinceLastVisit]);

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {heading}
      </h3>
      <ul className="divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]">
        {items.map((a, idx) => {
          const sentAtMs = new Date(a.sent_at).getTime();
          const isNew = sentAtMs > sinceLastVisit;
          const isJust = justArrived.has(a.id);
          const dividerBefore = idx === dividerIndex;
          return (
            <SinceLastVisitWrapper key={a.id} dividerBefore={dividerBefore}>
              <AlertRow
                alert={a}
                search={searchMap.get(a.search_id)}
                isNew={isNew}
                isJust={isJust}
              />
            </SinceLastVisitWrapper>
          );
        })}
      </ul>
    </div>
  );
}

function SinceLastVisitWrapper({
  children,
  dividerBefore,
}: {
  children: React.ReactNode;
  dividerBefore: boolean;
}) {
  return (
    <>
      {dividerBefore ? (
        <li
          aria-hidden
          className="relative flex items-center px-4 py-1"
        >
          <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
          <span className="px-3 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
            ▾ already seen
          </span>
          <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
        </li>
      ) : null}
      {children}
    </>
  );
}

function AlertRow({
  alert,
  search,
  isNew,
  isJust,
}: {
  alert: Alert;
  search?: SavedSearch;
  isNew: boolean;
  isJust: boolean;
}) {
  const criteria = safeJSONParse<{ kind?: string; price_eur?: number }>(alert.criteria, {});
  const targetPrice = criteria.kind === "price_below" ? criteria.price_eur : undefined;

  return (
    <li
      className={
        // A 1.4s accent fade on alert arrival is the one motion budget the
        // dashboard spends. After fade-out the row sits in its normal state.
        "relative flex items-center justify-between gap-4 px-4 py-3 transition-colors " +
        (isJust ? "bg-[oklch(0.30_0.08_220)]" : "")
      }
      style={isJust ? { transitionDuration: "1400ms" } : undefined}
    >
      {isNew ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-0.5 bg-[var(--color-accent)]"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <a
          href={alert.listing_url ?? "#"}
          target={alert.listing_url ? "_blank" : undefined}
          rel="noopener noreferrer"
          title={alert.listing_title ?? `listing #${alert.listing_id}`}
          className="listing-link block truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
        >
          {alert.listing_title ?? `listing #${alert.listing_id}`}
        </a>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          {alert.tag_label ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-[var(--color-bg-base)] ${tagBg(alert.tag_color)}`}
            >
              {alert.tag_label}
            </span>
          ) : null}
          {search ? (
            <Link
              to="/dashboard/searches/$id"
              params={{ id: String(search.id) }}
              className="truncate hover:text-[var(--color-accent)]"
            >
              {search.name}
            </Link>
          ) : (
            <span>search #{alert.search_id}</span>
          )}
          <span>·</span>
          <span>{relativeTime(alert.sent_at)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 text-right">
        <PriceContext alert={alert} targetEur={targetPrice} />
      </div>
    </li>
  );
}

/**
 * Inline "is this a good price" context for the alert row.
 *
 * Renders the listing price as the primary tabular number (the deciding
 * value), with the operator's target and a delta vs the search's 30d average
 * as inline secondary context. Falls back gracefully if the listing has no
 * price.
 */
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

  // Below-target wins the colour — it's the green-light the operator is
  // hunting for. Otherwise: cheaper-than-average is muted positive, more
  // expensive is muted.
  const belowTarget = targetEur != null && price != null && price <= targetEur;

  return (
    <div className="text-right font-mono tabular-nums">
      {price != null ? (
        <div
          className={
            "text-base font-semibold " +
            (belowTarget
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-text-primary)]")
          }
        >
          {formatEUR(price)}
        </div>
      ) : null}
      {deltaPct != null ? (
        <div
          className={
            "text-[11px] " +
            (deltaPct < 0
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-muted)]")
          }
        >
          {deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(0)}% vs 30d avg
        </div>
      ) : avg != null && avg > 0 ? (
        // Price missing on the alert but we still have an average → show it
        // so the row keeps some context.
        <div className="text-[11px] text-[var(--color-text-muted)]">
          30d avg {formatEUR(avg)}
        </div>
      ) : null}
      {targetEur != null ? (
        <div className="text-[10px] text-[var(--color-text-muted)]">
          target ≤ {formatEUR(targetEur)}
        </div>
      ) : null}
    </div>
  );
}

function EmptyFeed() {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">Alert feed</h2>
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-[var(--color-text-primary)]">No alerts yet.</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Set up a saved search and the scheduler starts polling olx.bg every 30 minutes.
          </p>
          <div className="mt-4">
            <Link
              to="/dashboard/searches/new"
              className={buttonVariants({ size: "sm", variant: "default" })}
            >
              Create a search
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin <= 0) return "due now";
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDayHeading(isoDay: string): string {
  if (!isoDay) return "—";
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (isoDay === todayKey) return "Today";
  if (isoDay === yesterday) return "Yesterday";
  const d = new Date(isoDay);
  if (Number.isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
