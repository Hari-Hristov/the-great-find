import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useListings, useUnhideListing } from "@/api/hooks/queries";
import { formatEUR, relativeTime, sortByPostedAtDesc } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/flagged")({
  component: FlaggedPage,
});

export function FlaggedPage() {
  const listings = useListings({ status: "hidden", limit: 500 });
  const unhide = useUnhideListing();

  const items = [...(listings.data?.items ?? [])].sort(sortByPostedAtDesc);

  return (
    <>
      <Topbar title="Flagged" subtitle="Listings you've hidden — won't show up or trigger alerts" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Hidden listings</CardTitle>
            <CardDescription>{items.length} flagged</CardDescription>
          </CardHeader>
          <CardContent>
            {listings.isLoading ? (
              <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                No flagged listings. Hit the eye-off icon on any listing to hide it.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {items.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0 flex-1 pr-4">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm opacity-50 hover:opacity-100 hover:text-[var(--color-accent)]"
                      >
                        {l.title}
                      </a>
                      <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {l.location_city ?? "—"} · posted {relativeTime(l.posted_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm tabular-nums opacity-50">
                        {formatEUR(l.price_eur)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Unhide listing"
                        disabled={unhide.isPending}
                        onClick={() => unhide.mutate(l.id)}
                        className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
