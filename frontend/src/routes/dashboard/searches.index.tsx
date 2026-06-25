import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteSearch, usePollAllSearches, usePollSearch, useSearches } from "@/api/hooks/queries";
import type { SavedSearch } from "@/api/types";
import { relativeTime } from "@/lib/utils";
export const Route = createFileRoute("/dashboard/searches/")({
  component: SearchesPage,
});

function SearchesPage() {
  const searches = useSearches();
  const [refreshFlash, setRefreshFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  // Show a transient "Refreshed N searches" pill that fades after 2.5s, so the
  // fleet-refresh confirmation doesn't mutate the button label permanently.
  const pollAll = usePollAllSearches();
  const onRefreshAll = () => {
    pollAll.mutate(undefined, {
      onSuccess: (data) => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        const count = data.count;
        setRefreshFlash(`Refreshed ${count} search${count === 1 ? "" : "es"}`);
        flashTimer.current = window.setTimeout(() => setRefreshFlash(null), 2500);
      },
    });
  };

  return (
    <>
      <Topbar
        title="Searches"
        subtitle="Saved olx.bg queries the scheduler is monitoring"
        actions={
          <div className="flex items-center gap-3">
            {refreshFlash ? (
              <span className="text-xs text-[var(--color-success)]" aria-live="polite">
                {refreshFlash}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={pollAll.isPending}
              onClick={onRefreshAll}
            >
              <RefreshCw className={`h-4 w-4 ${pollAll.isPending ? "animate-spin" : ""}`} />
              {pollAll.isPending ? "Refreshing…" : "Refresh all"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-[var(--color-text-muted)]">
            {searches.data?.length ?? 0} saved
          </div>
          <Link
            to="/dashboard/searches/new"
            className={buttonVariants({ size: "sm", variant: "default" })}
          >
            <Plus className="h-4 w-4" />
            New search
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(searches.data ?? []).map((s) => (
            <SearchCard key={s.id} search={s} />
          ))}
        </div>
      </div>
    </>
  );
}

function SearchCard({ search }: { search: SavedSearch }) {
  const del = useDeleteSearch();
  const poll = usePollSearch();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Card className="transition-colors hover:border-[var(--color-accent)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <Link
              to="/dashboard/searches/$id"
              params={{ id: String(search.id) }}
              className="block font-display text-lg font-semibold hover:text-[var(--color-accent)]"
            >
              {search.name}
            </Link>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">
              {search.platform} · {search.country} · every {search.poll_interval_min}m
              {search.last_polled_at ? ` · last polled ${relativeTime(search.last_polled_at)}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={search.active ? "success" : "secondary"}>
              {search.active ? "active" : "paused"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Refresh search"
              disabled={poll.isPending && poll.variables === search.id}
              onClick={() => poll.mutate(search.id)}
            >
              <RefreshCw className={`h-4 w-4 ${poll.isPending && poll.variables === search.id ? "animate-spin" : ""}`} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete search"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          del.mutate(search.id, {
            onSuccess: () => setConfirmOpen(false),
          })
        }
        title={`Delete "${search.name}"`}
        description={
          <>
            <p>
              This removes the saved search and every listing, alert, and price-history
              row that belongs to it. It cannot be undone — the data only lives on this
              machine.
            </p>
            <p className="mt-2">
              Type the search name to confirm.
            </p>
          </>
        }
        requireTyping={search.name}
        confirmLabel="Delete search"
        tone="destructive"
        pending={del.isPending}
      />
    </Card>
  );
}
