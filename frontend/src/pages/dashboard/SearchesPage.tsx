import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo } from "react";
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

  const { active, paused, total } = useMemo(() => {
    const data = searches.data ?? [];
    let active = 0, paused = 0;
    for (const s of data) { if (s.active) active++; else paused++; }
    return { active, paused, total: data.length };
  }, [searches.data]);

  const lastPolled = useMemo(() => {
    if (!searches.data?.length) return "—";
    const timestamps = searches.data
      .map((s) => (s.last_polled_at ? new Date(s.last_polled_at).getTime() : null))
      .filter((n): n is number => n !== null);
    if (!timestamps.length) return "—";
    return relativeTime(new Date(timestamps.reduce((a, b) => Math.max(a, b))).toISOString());
  }, [searches.data]);

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
        <SearchesStrip active={active} paused={paused} total={total} lastPolled={lastPolled} />

        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">All searches</h2>
          <Button
            size="sm"
            onClick={() => nav.push("/dashboard/searches/new")}
          >
            <Plus className="h-4 w-4" />
            New search
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {searches.isLoading ? (
            <Card className="md:col-span-2">
              <CardContent className="p-5">
                <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
              </CardContent>
            </Card>
          ) : total === 0 ? (
            <EmptySearches onNew={() => nav.push("/dashboard/searches/new")} />
          ) : (
            (searches.data ?? []).map((s) => (
              <SearchCard
                key={s.id}
                search={s}
                onOpen={() => nav.push(`/dashboard/searches/${s.id}`)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function SearchesStrip({
  active,
  paused,
  total,
  lastPolled,
}: {
  active: number;
  paused: number;
  total: number;
  lastPolled: string;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[var(--color-border-subtle)] pb-4 md:grid-cols-4">
      <StripCell label="Active">
        <span className="text-[var(--color-text-primary)]">{active}</span>
        <span className="ml-1 text-[var(--color-text-muted)]">/ {total}</span>
      </StripCell>
      <StripCell label="Paused">{paused}</StripCell>
      <StripCell label="Total">{total}</StripCell>
      <StripCell label="Last polled">{lastPolled}</StripCell>
    </dl>
  );
}

function StripCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
        {children}
      </dd>
    </div>
  );
}

function EmptySearches({ onNew }: { onNew: () => void }) {
  return (
    <Card className="md:col-span-2">
      <CardContent className="p-5">
        <p className="text-sm text-[var(--color-text-primary)]">No searches yet.</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Create a saved query and the scheduler starts polling olx.bg every 30 minutes.
        </p>
        <div className="mt-4">
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4" />
            New search
          </Button>
        </div>
      </CardContent>
    </Card>
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
