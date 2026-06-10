import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAlerts } from "@/api/hooks/queries";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const alerts = useAlerts(200);

  return (
    <>
      <Topbar title="Alerts" subtitle="Most recent fired alerts" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Last {alerts.data?.length ?? 0} alerts</CardTitle>
            <CardDescription>Updated live via SSE — newest first</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.isLoading ? (
              <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                Loading…
              </div>
            ) : (alerts.data?.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                No alerts yet — they'll appear here when listings match your rules.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                    <tr className="border-b border-[var(--color-border-subtle)]">
                      <th className="py-2 pr-4">Sent</th>
                      <th className="py-2 pr-4">Search</th>
                      <th className="py-2 pr-4">Listing</th>
                      <th className="py-2 pr-4">Criteria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {alerts.data!.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">
                          {formatDateTime(a.sent_at)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="default">#{a.search_id}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {a.listing_url ? (
                            <a
                              href={a.listing_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[var(--color-accent)]"
                            >
                              {a.listing_title ?? `#${a.listing_id}`}
                            </a>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">
                              #{a.listing_id}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <code className="text-xs text-[var(--color-text-muted)]">
                            {a.criteria}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
