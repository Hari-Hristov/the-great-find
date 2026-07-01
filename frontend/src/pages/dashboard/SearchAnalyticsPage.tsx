import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/Stat";
import { TrendChart, type TrendDatum } from "@/components/charts/TrendChart";
import { useAnalytics, useSearch } from "@/api/hooks/queries";
import { formatEUR } from "@/lib/utils";
import { useWindowNav } from "@/contexts/DesktopContext";

const WINDOWS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;

function WindowSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {WINDOWS.map((w) => (
        <button
          key={w.value}
          type="button"
          aria-pressed={value === w.value}
          onClick={() => onChange(w.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === w.value
              ? "bg-[var(--color-accent)] text-[var(--color-bg-base)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]"
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
      {children}
    </h2>
  );
}

export function SearchAnalyticsPage() {
  const nav = useWindowNav("searches");
  const m = nav.current.match(/^\/dashboard\/searches\/(\d+)\/analytics$/);
  const idParam = m ? m[1] : "0";
  const id = Number(idParam);

  const search = useSearch(id);
  const [activeWindow, setActiveWindow] = useState(30);
  const [inactiveWindow, setInactiveWindow] = useState(30);

  const activeAnalytics = useAnalytics(id, activeWindow, undefined, undefined, "active");
  const inactiveAnalytics = useAnalytics(id, inactiveWindow, undefined, undefined, "inactive");

  const activeTrend: TrendDatum[] = (activeAnalytics.data?.trend_eur ?? []).map((p) => ({
    date: p.day,
    avgEur: p.avg_eur ?? 0,
    count: p.n,
  }));

  const inactiveTrend: TrendDatum[] = (inactiveAnalytics.data?.trend_eur ?? []).map((p) => ({
    date: p.day,
    avgEur: p.avg_eur ?? 0,
    count: p.n,
  }));

  const domAvg = inactiveAnalytics.data?.dom_avg_days;
  const domMedian = inactiveAnalytics.data?.dom_median_days;
  const absorption = inactiveAnalytics.data?.absorption_per_week;

  return (
    <>
      <Topbar
        title={search.data ? `${search.data.name} — Analytics` : "Analytics"}
        back={{
          onClick: () => nav.pop(),
          label: "Back to search",
        }}
      />

      <div className="flex-1 overflow-auto px-6 py-6 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeading>Active market</SectionHeading>
            <WindowSelector value={activeWindow} onChange={setActiveWindow} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Stat
              label="Listings"
              value={(activeAnalytics.data?.listing_count ?? 0).toString()}
            />
            <Stat label="Min" value={formatEUR(activeAnalytics.data?.min_eur ?? null)} />
            <Stat label="Avg" value={formatEUR(activeAnalytics.data?.avg_eur ?? null)} />
            <Stat label="Max" value={formatEUR(activeAnalytics.data?.max_eur ?? null)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Price & volume — last {activeWindow} days</CardTitle>
              <CardDescription>Daily average EUR price and active listing count</CardDescription>
            </CardHeader>
            <CardContent>
              {activeTrend.length === 0 ? (
                <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                  Not enough data yet.
                </div>
              ) : (
                <TrendChart data={activeTrend} />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeading>Sold / inactive prices</SectionHeading>
            <WindowSelector value={inactiveWindow} onChange={setInactiveWindow} />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Listings that left the market — likely sold. Their last known price reflects what buyers actually paid.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Stat
              label="Closed"
              value={(inactiveAnalytics.data?.listing_count ?? 0).toString()}
            />
            <Stat label="Min" value={formatEUR(inactiveAnalytics.data?.min_eur ?? null)} />
            <Stat label="Avg" value={formatEUR(inactiveAnalytics.data?.avg_eur ?? null)} />
            <Stat label="Max" value={formatEUR(inactiveAnalytics.data?.max_eur ?? null)} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Stat
              label="Avg days on market"
              value={domAvg !== undefined ? `${Math.round(domAvg)}d` : "—"}
            />
            <Stat
              label="Median days on market"
              value={domMedian !== undefined ? `${Math.round(domMedian)}d` : "—"}
            />
            <Stat
              label="Absorption / week"
              value={absorption !== undefined ? absorption.toString() : "—"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sold price trend — last {inactiveWindow} days</CardTitle>
              <CardDescription>Daily average EUR price of inactive listings</CardDescription>
            </CardHeader>
            <CardContent>
              {inactiveTrend.length === 0 ? (
                <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No closed listings in this window yet. Data accumulates as listings go inactive.
                </div>
              ) : (
                <TrendChart data={inactiveTrend} />
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
