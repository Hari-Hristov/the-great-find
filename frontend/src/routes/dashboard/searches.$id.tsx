import { createFileRoute, useParams, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { EyeOff, Loader2, Pencil, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchForm } from "@/components/SearchForm";
import { useHideListing, useListings, usePollSearch, useSearch } from "@/api/hooks/queries";
import { formatEUR, relativeTime, safeJSONParse, sortByPostedAtDesc } from "@/lib/utils";
import type { SavedSearch } from "@/api/types";

export const Route = createFileRoute("/dashboard/searches/$id")({
  component: SearchDetailPage,
});

function SearchDetailPage() {
  const { id: idParam } = useParams({ from: "/dashboard/searches/$id" });
  const id = Number(idParam);
  const matchRoute = useMatchRoute();
  const isChildActive = matchRoute({ to: "/dashboard/searches/$id/analytics", params: { id: idParam }, fuzzy: true });

  const search = useSearch(id);

  // Stable price-range derived from query_params — JSON.parse is otherwise
  // re-run on every render, which fuzzes the listings query inputs.
  const { priceMin, priceMax } = useMemo(() => {
    if (!search.data) return { priceMin: undefined, priceMax: undefined };
    const qp = safeJSONParse<Record<string, string | string[]>>(search.data.query_params, {});
    return {
      priceMin: Number(qp.price_min ?? 0) || undefined,
      priceMax: Number(qp.price_max ?? 0) || undefined,
    };
  }, [search.data]);

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

  return isChildActive ? <Outlet /> : (
    <>
      <Topbar
        title={search.data?.name ?? "Search"}
        subtitle={subtitle}
        back={{ to: "/dashboard/searches", label: "Back to searches" }}
      />

      {/* Action strip — sits between topbar and content, always visible */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-6 py-2">
        <div className="flex items-center gap-1">
          <Link
            to="/dashboard/searches/$id/analytics"
            params={{ id: idParam }}
            className={buttonVariants({ size: "sm", variant: "ghost" })}
          >
            Analytics
          </Link>
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

      {/* Watching strip — one-line summary of the saved-search params */}
      {search.data ? (
        <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-6 py-2">
          <ParamsStrip search={search.data} />
        </div>
      ) : null}

      <div className="flex-1 overflow-auto px-6 py-6">
        {editing && search.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Edit search</CardTitle>
            </CardHeader>
            <CardContent>
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
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={l.title}
                      className="listing-link block truncate text-sm hover:text-[var(--color-accent)]"
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
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
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
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.title}
                        className="listing-link block truncate text-sm hover:text-[var(--color-accent)]"
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
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
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

/**
 * One-line summary of the saved-search parameters, sitting under the action
 * strip on the detail page. Answers the operator's "is this still set the
 * way I want?" check without eating the top of the page with a full JSON
 * read-out. The Edit affordance handles the deeper "let me re-tune this."
 */
function ParamsStrip({ search }: { search: SavedSearch }) {
  const queryFields = useMemo(
    () => safeJSONParse<Record<string, unknown>>(search.query_params, {}),
    [search.query_params],
  );
  const criteriaFields = useMemo(
    () => safeJSONParse<Record<string, unknown>>(search.alert_criteria, {}),
    [search.alert_criteria],
  );

  const parts: string[] = [];

  const keyword = queryFields.keyword;
  if (typeof keyword === "string" && keyword) parts.push(`"${keyword}"`);

  const category = queryFields.category;
  if (typeof category === "string" && category) parts.push(category);

  const location = queryFields.location;
  parts.push(typeof location === "string" && location ? location : "anywhere in BG");

  const priceMin = queryFields.price_min;
  const priceMax = queryFields.price_max;
  if (priceMin && priceMax) parts.push(`€${priceMin} – €${priceMax}`);
  else if (priceMax) parts.push(`≤ €${priceMax}`);
  else if (priceMin) parts.push(`≥ €${priceMin}`);

  const condition = queryFields.condition;
  if (typeof condition === "string" && condition) parts.push(condition);

  const sellerType = queryFields.seller_type;
  if (typeof sellerType === "string" && sellerType) parts.push(sellerType);

  parts.push(`every ${search.poll_interval_min}m`);

  const alertPrice = (criteriaFields.kind === "price_below" ? criteriaFields.price_eur : undefined);
  if (typeof alertPrice === "number") parts.push(`alert ≤ €${alertPrice}`);

  return (
    <div className="text-xs text-[var(--color-text-muted)]">
      <span className="text-xs font-medium uppercase tracking-wide">Watching</span>
      <span className="ml-2 font-mono text-[var(--color-text-primary)]">
        {parts.join(" · ")}
      </span>
    </div>
  );
}
