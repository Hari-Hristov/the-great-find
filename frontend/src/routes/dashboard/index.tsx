import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAlerts, useListings, useSearches } from "@/api/hooks/queries";
import { formatEUR, relativeTime } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
});

function OverviewPage() {
  const searches = useSearches();
  const alerts = useAlerts(50);
  const recent = useListings({ status: "active", limit: 8 });

  const activeCount = searches.data?.filter((s) => s.active).length ?? 0;
  const totalSearches = searches.data?.length ?? 0;
  const alertCount = alerts.data?.length ?? 0;

  const minPrice = recent.data?.reduce<number | null>((acc, l) => {
    if (l.price_eur === undefined) return acc;
    return acc === null ? l.price_eur : Math.min(acc, l.price_eur);
  }, null) ?? null;

  return (
    <>
      <Topbar title="Overview" subtitle="Live status of your monitored searches" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Saved searches" value={`${activeCount}/${totalSearches}`} hint="active / total" />
          <StatCard label="Recent alerts" value={alertCount.toString()} hint="last 50" />
          <StatCard label="New listings" value={(recent.data?.length ?? 0).toString()} hint="active, latest" />
          <StatCard label="Cheapest active" value={formatEUR(minPrice)} hint="among recent" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Latest alerts</CardTitle>
              <CardDescription>Newest fired alerts across all searches</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.isLoading ? (
                <Empty>Loading…</Empty>
              ) : (alerts.data?.length ?? 0) === 0 ? (
                <Empty>No alerts yet — they'll appear here when listings match.</Empty>
              ) : (
                <ul className="divide-y divide-[var(--color-border-subtle)]">
                  {alerts.data!.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2">
                      <div className="min-w-0 flex-1 pr-4">
                        <a
                          href={a.listing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm hover:text-[var(--color-accent)]"
                        >
                          {a.listing_title ?? `listing #${a.listing_id}`}
                        </a>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <Badge variant="default">search #{a.search_id}</Badge>
                          <span>{relativeTime(a.sent_at)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent listings</CardTitle>
              <CardDescription>Most recently scraped active listings</CardDescription>
            </CardHeader>
            <CardContent>
              {recent.isLoading ? (
                <Empty>Loading…</Empty>
              ) : (recent.data?.length ?? 0) === 0 ? (
                <Empty>Nothing scraped yet — add a search to start.</Empty>
              ) : (
                <ul className="divide-y divide-[var(--color-border-subtle)]">
                  {recent.data!.map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2">
                      <div className="min-w-0 flex-1 pr-4">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm hover:text-[var(--color-accent)]"
                        >
                          {l.title}
                        </a>
                        <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {l.location_city ?? "—"} · {relativeTime(l.posted_at)}
                        </div>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {formatEUR(l.price_eur)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}
