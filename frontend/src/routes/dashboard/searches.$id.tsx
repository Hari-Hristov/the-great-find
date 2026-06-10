import { createFileRoute, useParams } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendChart, type TrendDatum } from "@/components/charts/TrendChart";
import { useAnalytics, useListings, usePollSearch, useSearch } from "@/api/hooks/queries";
import { formatEUR, relativeTime } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/searches/$id")({
  component: SearchDetailPage,
});

function SearchDetailPage() {
  const { id: idParam } = useParams({ from: "/dashboard/searches/$id" });
  const id = Number(idParam);

  const search = useSearch(id);
  const analytics = useAnalytics(id, 30);
  const listings = useListings({ search_id: id, limit: 50 });
  const poll = usePollSearch();

  const trend: TrendDatum[] = (analytics.data?.trend_eur ?? []).map((p) => ({
    date: p.day,
    avgEur: p.avg_eur ?? 0,
    count: p.n,
  }));

  const subtitle = search.data
    ? `${search.data.platform} · ${search.data.country} · every ${search.data.poll_interval_min}m`
    : undefined;

  return (
    <>
      <Topbar
        title={search.data?.name ?? "Search"}
        subtitle={subtitle}
        back={{ to: "/dashboard/searches", label: "Back to searches" }}
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={poll.isPending}
            onClick={() => poll.mutate(id)}
          >
            <RefreshCw className={`h-4 w-4 ${poll.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Stat
            label="Listings"
            value={(analytics.data?.listing_count ?? 0).toString()}
          />
          <Stat label="Min" value={formatEUR(analytics.data?.min_eur ?? null)} />
          <Stat label="Avg" value={formatEUR(analytics.data?.avg_eur ?? null)} />
          <Stat label="Max" value={formatEUR(analytics.data?.max_eur ?? null)} />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Price & volume — last 30 days</CardTitle>
            <CardDescription>Daily average EUR price and listing count</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                Not enough data yet.
              </div>
            ) : (
              <TrendChart data={trend} />
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Listings</CardTitle>
            <CardDescription>{listings.data?.length ?? 0} matched</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {(listings.data ?? []).map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1 pr-4">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm hover:text-[var(--color-accent)]"
                    >
                      {l.title}
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <Badge variant={l.status === "active" ? "success" : "secondary"}>
                        {l.status}
                      </Badge>
                      <span>{l.location_city ?? "—"}</span>
                      <span>·</span>
                      <span>posted {relativeTime(l.posted_at)}</span>
                    </div>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {formatEUR(l.price_eur)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
