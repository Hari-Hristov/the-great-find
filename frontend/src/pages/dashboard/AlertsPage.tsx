import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { useAlerts, useSearches } from "@/api/hooks/queries";
import { relativeTime } from "@/lib/utils";
import { useWindowNav } from "@/contexts/DesktopContext";

function StatusStrip({
  total,
  today,
  thisWeek,
  watchedSearches,
}: {
  total: number;
  today: number;
  thisWeek: number;
  watchedSearches: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[var(--color-border-subtle)] pb-4 md:grid-cols-4">
      <StatusCell label="Total alerts" value={total.toString()} />
      <StatusCell label="Today" value={today.toString()} />
      <StatusCell label="This week" value={thisWeek.toString()} />
      <StatusCell label="Searches watched" value={watchedSearches.toString()} />
    </dl>
  );
}

function StatusCell({ label, value }: { label: string; value: string }) {
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

export function AlertsPage() {
  const nav = useWindowNav("alerts");
  const alerts = useAlerts(200);
  const searches = useSearches();

  const searchNameMap = useMemo(
    () => new Map((searches.data ?? []).map((s) => [s.id, s.name])),
    [searches.data],
  );

  const visible = useMemo(
    () => (alerts.data ?? []).filter((a) => a.listing_status !== "hidden"),
    [alerts.data],
  );

  const { grouped, latestAt, statsToday, statsWeek } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const groupedMap = new Map<number, number>();
    const latestAtMap = new Map<number, string>();
    let today = 0;
    let week = 0;
    const todayMs = todayStart.getTime();
    const weekMs = weekStart.getTime();

    for (const a of visible) {
      groupedMap.set(a.search_id, (groupedMap.get(a.search_id) ?? 0) + 1);
      const prev = latestAtMap.get(a.search_id);
      if (!prev || a.sent_at > prev) latestAtMap.set(a.search_id, a.sent_at);

      const ts = new Date(a.sent_at).getTime();
      if (ts >= todayMs) today++;
      if (ts >= weekMs) week++;
    }

    return { grouped: groupedMap, latestAt: latestAtMap, statsToday: today, statsWeek: week };
  }, [visible]);

  const searchIds = useMemo(
    () =>
      Array.from(grouped.keys()).sort((a, b) => {
        const nameA = searchNameMap.get(a) ?? String(a);
        const nameB = searchNameMap.get(b) ?? String(b);
        return nameA.localeCompare(nameB);
      }),
    [grouped, searchNameMap],
  );

  const isLoading = alerts.isLoading || searches.isLoading;

  return (
    <>
      <Topbar title="Alerts" subtitle="Click a search to see its alerts" />

      <div className="flex-1 overflow-auto px-6 py-6">
        {!isLoading && (
          <StatusStrip
            total={visible.length}
            today={statsToday}
            thisWeek={statsWeek}
            watchedSearches={searchIds.length}
          />
        )}

        <div className="mt-8">
          <section className="space-y-4">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Searches
            </h2>

            {isLoading ? (
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
                </CardContent>
              </Card>
            ) : searchIds.length === 0 ? (
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-[var(--color-text-primary)]">No alerts yet.</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    They'll appear here once a saved search fires its first match.
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
            ) : (
              <div className="flex flex-col gap-3">
                {searchIds.map((sid) => (
                  <Card
                    key={sid}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    onClick={() => nav.push(`/dashboard/alerts/${sid}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        nav.push(`/dashboard/alerts/${sid}`);
                      }
                    }}
                  >
                    <CardContent className="flex items-center justify-between p-5">
                      <div className="min-w-0">
                        <p className="font-display text-base font-semibold">
                          {searchNameMap.get(sid) ?? `Search #${sid}`}
                        </p>
                        {latestAt.get(sid) ? (
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                            Last alert {relativeTime(latestAt.get(sid))}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="secondary">{grouped.get(sid)}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
