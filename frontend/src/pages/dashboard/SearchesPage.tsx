import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDeleteSearch, usePollAllSearches, usePollSearch, useSearches } from "@/api/hooks/queries";
import type { SavedSearch } from "@/api/types";
import { relativeTime } from "@/lib/utils";
import { useWindowNav } from "@/contexts/DesktopContext";

export function SearchesPage() {
  const searches = useSearches();
  const pollAll = usePollAllSearches();
  const nav = useWindowNav("searches");

  const refreshLabel = pollAll.isPending
    ? "Refreshing…"
    : pollAll.data
      ? `Refreshed ${pollAll.data.count} search${pollAll.data.count === 1 ? "" : "es"}`
      : "Refresh all";

  return (
    <>
      <Topbar
        title="Searches"
        subtitle="Saved olx.bg queries the scheduler is monitoring"
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={pollAll.isPending}
            onClick={() => pollAll.mutate()}
          >
            <RefreshCw className={`h-4 w-4 ${pollAll.isPending ? "animate-spin" : ""}`} />
            {refreshLabel}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-[var(--color-text-muted)]">
            {searches.data?.length ?? 0} saved
          </div>
          <button
            type="button"
            onClick={() => nav.push("/dashboard/searches/new")}
            className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-bg-base)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <Plus className="h-4 w-4" />
            New search
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(searches.data ?? []).map((s) => (
            <SearchCard key={s.id} search={s} onOpen={() => nav.push(`/dashboard/searches/${s.id}`)} />
          ))}
        </div>
      </div>
    </>
  );
}

function SearchCard({ search, onOpen }: { search: SavedSearch; onOpen: () => void }) {
  const del = useDeleteSearch();
  const poll = usePollSearch();
  return (
    <Card className="transition-colors hover:border-[var(--color-accent)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="block text-left font-display text-lg font-semibold hover:text-[var(--color-accent)]"
            >
              {search.name}
            </button>
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
              variant="ghost"
              size="icon"
              aria-label="Refresh search"
              disabled={poll.isPending && poll.variables === search.id}
              onClick={() => poll.mutate(search.id)}
            >
              <RefreshCw className={`h-4 w-4 ${poll.isPending && poll.variables === search.id ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete search"
              onClick={() => {
                if (confirm(`Delete "${search.name}"?`)) del.mutate(search.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
