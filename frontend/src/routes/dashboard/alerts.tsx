import { createFileRoute } from "@tanstack/react-router";
import { EyeOff, Flag } from "lucide-react";
import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAlerts, useFlagAlert, useHideListing, useSearches } from "@/api/hooks/queries";
import { formatEUR, relativeTime } from "@/lib/utils";
import type { Alert } from "@/api/types";

export const Route = createFileRoute("/dashboard/alerts")({
  component: AlertsPage,
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

function SearchAlertCard({
  searchName,
  alerts,
}: {
  searchName: string;
  alerts: Alert[];
}) {
  const [open, setOpen] = useState(false);
  const hide = useHideListing();
  const flag = useFlagAlert();

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{searchName}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{alerts.length}</Badge>
            <span className="text-xs text-[var(--color-text-muted)]">
              {open ? "▲" : "▼"}
            </span>
          </div>
        </div>
      </CardHeader>

      {open ? (
        <CardContent className="pt-0">
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
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
                    {a.flagged ? (
                      <Badge variant="default" className="font-mono">flagged</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!a.flagged ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Flag alert"
                      disabled={flag.isPending}
                      onClick={() => flag.mutate(a.id)}
                      className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                  ) : null}
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
        </CardContent>
      ) : null}
    </Card>
  );
}

function AlertsPage() {
  const alerts = useAlerts(200);
  const searches = useSearches();

  const searchNameMap = new Map(
    (searches.data ?? []).map((s) => [s.id, s.name]),
  );

  const visible = (alerts.data ?? []).filter((a) => a.listing_status !== "hidden");

  const grouped = new Map<number, Alert[]>();
  for (const a of visible) {
    const bucket = grouped.get(a.search_id) ?? [];
    bucket.push(a);
    grouped.set(a.search_id, bucket);
  }

  const searchIds = Array.from(grouped.keys()).sort((a, b) => {
    const nameA = searchNameMap.get(a) ?? String(a);
    const nameB = searchNameMap.get(b) ?? String(b);
    return nameA.localeCompare(nameB);
  });

  return (
    <>
      <Topbar title="Alerts" subtitle="Grouped by search — click a card to expand" />

      <div className="flex-1 overflow-auto px-6 py-6">
        {alerts.isLoading || searches.isLoading ? (
          <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            Loading…
          </div>
        ) : searchIds.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            No alerts yet — they'll appear here when listings match your rules.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {searchIds.map((sid) => (
              <SearchAlertCard
                key={sid}
                searchName={searchNameMap.get(sid) ?? `Search #${sid}`}
                alerts={grouped.get(sid)!}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
