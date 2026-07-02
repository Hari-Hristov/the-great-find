import { EyeOff, Loader2, MoreHorizontal, Pencil, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchForm } from "@/components/SearchForm";
import { useHideListing, useListings, usePollSearch, useSearch } from "@/api/hooks/queries";
import { formatEUR, relativeTime, sortByPostedAtDesc } from "@/lib/utils";
import { safeHref } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { SavedSearch } from "@/api/types";
import { useWindowNav } from "@/contexts/DesktopContext";

function parseQueryParams(raw: string): Record<string, string | string[]> {
  try {
    return JSON.parse(raw) as Record<string, string | string[]>;
  } catch {
    return {};
  }
}

function idFromRoute(route: string): string | null {
  const m = route.match(/^\/dashboard\/searches\/(\d+)/);
  return m ? m[1] : null;
}

export function SearchDetailPage() {
  const nav = useWindowNav("searches");
  const idParam = idFromRoute(nav.current) ?? "0";
  const id = Number(idParam);

  const search = useSearch(id);

  const qp = search.data ? parseQueryParams(search.data.query_params) : null;
  const priceMin = qp ? Number(qp.price_min ?? 0) || undefined : undefined;
  const priceMax = qp ? Number(qp.price_max ?? 0) || undefined : undefined;

  const listings = useListings({
    search_id: id,
    status: "active",
    limit: 200,
    price_eur_min: priceMin,
    price_eur_max: priceMax,
  }, { enabled: !!search.data });

  const inactiveListings = useListings({
    search_id: id,
    status: "removed",
    limit: 200,
    price_eur_min: priceMin,
    price_eur_max: priceMax,
  }, { enabled: !!search.data });

  const poll = usePollSearch();
  const hide = useHideListing();
  const [editing, setEditing] = useState(false);

  const isBusy = poll.isPending || listings.isFetching || inactiveListings.isFetching;

  const subtitle = search.data
    ? `${search.data.platform} · ${search.data.country} · every ${search.data.poll_interval_min}m`
    : undefined;

  return (
    <>
      <Topbar
        title={search.data?.name ?? "Search"}
        subtitle={subtitle}
        back={{ onClick: () => nav.pop(), label: "Back to searches" }}
        actions={search.data ? <DetailsOverflow search={search.data} /> : undefined}
      />

      {/* Action strip — sits between topbar and content, always visible */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-6 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => nav.push(`/dashboard/searches/${idParam}/analytics`)}
            className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-button)] px-3 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
          >
            Analytics
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? "Cancel editing" : "Edit"}
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">{editing ? "Cancel" : "Edit"}</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={poll.isPending}
            onClick={() => poll.mutate(id)}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${poll.isPending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {editing && search.data ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Edit search</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <SearchForm
                mode="edit"
                search={search.data}
                onSuccess={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card className={editing ? "mt-6" : ""}>
          <CardHeader>
            <CardTitle>Listings</CardTitle>
            <CardDescription>
              {listings.data?.total ?? 0} active · {inactiveListings.data?.total ?? 0} inactive
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            {isBusy && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-[var(--color-bg-card)]/60 backdrop-blur-[2px] pointer-events-none">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" />
              </div>
            )}
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {[...(listings.data?.items ?? [])].sort(sortByPostedAtDesc).map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1 pr-4">
                    <a
                      href={safeHref(l.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm hover:text-[var(--color-accent)]"
                    >
                      {l.title}
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <Badge variant="success">{l.status}</Badge>
                      <span>{l.location_city ?? "—"}</span>
                      <span>·</span>
                      <span>posted {relativeTime(l.posted_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm tabular-nums">
                      {formatEUR(l.price_eur)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Hide listing"
                      disabled={hide.isPending}
                      onClick={() => hide.mutate(l.id)}
                      className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
              {(inactiveListings.data?.items?.length ?? 0) > 0 && (
                [...(inactiveListings.data?.items ?? [])].sort(sortByPostedAtDesc).map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-3 opacity-50">
                    <div className="min-w-0 flex-1 pr-4">
                      <a
                        href={safeHref(l.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm hover:text-[var(--color-accent)]"
                      >
                        {l.title}
                      </a>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                        <Badge variant="secondary">inactive</Badge>
                        <span>{l.location_city ?? "—"}</span>
                        <span>·</span>
                        <span>posted {relativeTime(l.posted_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm tabular-nums">
                        {formatEUR(l.price_eur)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Hide listing"
                        disabled={hide.isPending}
                        onClick={() => hide.mutate(l.id)}
                        className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DetailsOverflow({ search }: { search: SavedSearch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  let queryFields: Record<string, unknown> = {};
  let criteriaFields: Record<string, unknown> = {};
  try { queryFields = JSON.parse(search.query_params); } catch { /* invalid JSON — keep defaults */ }
  try { if (search.alert_criteria) criteriaFields = JSON.parse(search.alert_criteria); } catch { /* invalid JSON — keep defaults */ }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More details"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md border border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]",
          open ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded border border-[var(--color-terminal-border)] bg-[var(--color-terminal-bg)] shadow-lg" style={{ boxShadow: `0 0 24px var(--color-terminal-shadow), 0 4px 24px rgba(0,0,0,0.6)` }}>
          <div className="flex items-center justify-between border-b border-[var(--color-terminal-border)] px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--color-terminal-text-dim)]">
              ████ clearance lv-2 · {search.id.toString().padStart(6, "0")} ████
            </span>
            <button onClick={() => setOpen(false)} className="text-[var(--color-terminal-text-dim)] hover:text-[var(--color-terminal-text-bright)]">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-[var(--color-terminal-border)] p-3 font-mono text-xs">
            {Object.entries(queryFields).map(([k, v]) => (
              <div key={k} className="flex gap-3 py-1.5">
                <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-terminal-text-dim)]">{k.replace(/_/g, " ")}</span>
                <span className="break-all text-[var(--color-terminal-text-bright)]">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
              </div>
            ))}
            {Object.keys(criteriaFields).length > 0 && (
              <>
                <div className="pb-1 pt-2 text-[9px] uppercase tracking-[0.25em] text-[var(--color-terminal-text-dim)]">▸ alert criteria</div>
                {Object.entries(criteriaFields).map(([k, v]) => (
                  <div key={k} className="flex gap-3 py-1.5">
                    <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-terminal-text-dim)]">{k.replace(/_/g, " ")}</span>
                    <span className="break-all text-[var(--color-terminal-text-bright)]">{String(v)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
