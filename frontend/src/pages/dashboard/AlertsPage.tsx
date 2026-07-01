import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAlerts, useSearches } from "@/api/hooks/queries";
import { relativeTime } from "@/lib/utils";
import { useWindowNav } from "@/contexts/DesktopContext";

export function AlertsPage() {
  const nav = useWindowNav("alerts");
  const alerts = useAlerts(200);
  const searches = useSearches();

  const searchNameMap = new Map(
    (searches.data ?? []).map((s) => [s.id, s.name]),
  );

  const visible = (alerts.data ?? []).filter((a) => a.listing_status !== "hidden");

  const grouped = new Map<number, number>();
  const latestAt = new Map<number, string>();
  for (const a of visible) {
    grouped.set(a.search_id, (grouped.get(a.search_id) ?? 0) + 1);
    const prev = latestAt.get(a.search_id);
    if (!prev || a.sent_at > prev) latestAt.set(a.search_id, a.sent_at);
  }

  const searchIds = Array.from(grouped.keys()).sort((a, b) => {
    const nameA = searchNameMap.get(a) ?? String(a);
    const nameB = searchNameMap.get(b) ?? String(b);
    return nameA.localeCompare(nameB);
  });

  return (
    <>
      <Topbar title="Alerts" subtitle="Click a search to see its alerts" />

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
              <Card
                key={sid}
                className="cursor-pointer transition-colors hover:border-[var(--color-accent)]"
                onClick={() => nav.push(`/dashboard/alerts/${sid}`)}
              >
                <CardContent className="flex items-center justify-between p-5">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold">
                      {searchNameMap.get(sid) ?? `Search #${sid}`}
                    </p>
                    {latestAt.get(sid) ? (
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        Last alert {relativeTime(latestAt.get(sid)!)}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="secondary">{grouped.get(sid)}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
