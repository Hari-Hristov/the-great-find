import { createFileRoute, useParams } from "@tanstack/react-router";
import { EyeOff, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { TrendChart, type TrendDatum } from "@/components/charts/TrendChart";
import { useAnalytics, useHideListing, useListings, usePollSearch, useSearch, useUpdateSearch } from "@/api/hooks/queries";
import { formatEUR, relativeTime } from "@/lib/utils";
import type { SavedSearch } from "@/api/types";

export const Route = createFileRoute("/dashboard/searches/$id")({
  component: SearchDetailPage,
});

function parseQueryParams(raw: string): Record<string, string | string[]> {
  try {
    return JSON.parse(raw) as Record<string, string | string[]>;
  } catch {
    return {};
  }
}

function parseAlertBelowEur(raw?: string): string {
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw) as { kind?: string; price_eur?: number };
    if (obj.kind === "price_below" && typeof obj.price_eur === "number") {
      return String(obj.price_eur);
    }
  } catch {
    // ignore
  }
  return "";
}

function EditForm({
  search,
  onDone,
}: {
  search: SavedSearch;
  onDone: () => void;
}) {
  const update = useUpdateSearch(search.id);
  const qp = parseQueryParams(search.query_params);

  const [name, setName] = useState(search.name);
  const [queryText, setQueryText] = useState((qp.keyword as string) ?? "");
  const [category, setCategory] = useState((qp.category as string) ?? "");
  const [location, setLocation] = useState((qp.location as string) ?? "");
  const [minPrice, setMinPrice] = useState((qp.price_min as string) ?? "");
  const [maxPrice, setMaxPrice] = useState((qp.price_max as string) ?? "");
  const [condition, setCondition] = useState((qp.condition as string) ?? "");
  const [sellerType, setSellerType] = useState((qp.seller_type as string) ?? "");
  const [sort, setSort] = useState((qp.sort as string) ?? "");
  const [alertBelowEur, setAlertBelowEur] = useState(parseAlertBelowEur(search.alert_criteria));
  const [interval, setInterval] = useState(search.poll_interval_min);
  const [keywordVariants, setKeywordVariants] = useState<string[]>(
    Array.isArray(qp.keyword_variants) ? (qp.keyword_variants as string[]) : [],
  );
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!queryText.trim()) {
      setError("Keywords are required");
      return;
    }

    const queryParams: Record<string, string | string[]> = { keyword: queryText.trim() };
    if (category.trim()) queryParams.category = category.trim();
    if (location.trim()) queryParams.location = location.trim();
    if (minPrice.trim()) queryParams.price_min = minPrice.trim();
    if (maxPrice.trim()) queryParams.price_max = maxPrice.trim();
    if (condition) queryParams.condition = condition;
    if (sellerType) queryParams.seller_type = sellerType;
    if (sort) queryParams.sort = sort;
    const filtered = keywordVariants.filter((v) => v.trim());
    if (filtered.length > 0) queryParams.keyword_variants = filtered;

    let alertCriteria: Record<string, unknown> | undefined;
    if (alertBelowEur.trim()) {
      const n = Number(alertBelowEur);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Alert price must be a positive number");
        return;
      }
      alertCriteria = { kind: "price_below", price_eur: n };
    }

    update.mutate(
      {
        name: name.trim(),
        query_params: queryParams,
        alert_criteria: alertCriteria,
        poll_interval_min: interval,
        active: search.active,
      },
      {
        onSuccess: onDone,
        onError: (err) => setError(err instanceof Error ? err.message : String(err)),
      },
    );
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Edit search</CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="md:col-span-2">
            <Label>Keywords</Label>
            <Input value={queryText} onChange={(e) => setQueryText(e.target.value)} required />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              What you'd type into the olx.bg search bar.
            </p>
          </div>

          <div className="md:col-span-2">
            <Label>Search variants (optional)</Label>
            {keywordVariants.map((v, i) => (
              <div key={i} className="mt-1 flex items-center gap-2">
                <Input
                  value={v}
                  onChange={(e) => {
                    const next = [...keywordVariants];
                    next[i] = e.target.value;
                    setKeywordVariants(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove variant"
                  onClick={() => setKeywordVariants(keywordVariants.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => setKeywordVariants([...keywordVariants, ""])}
            >
              <Plus className="h-4 w-4" />
              Add variant
            </Button>
          </div>

          <div>
            <Label>Category slug (optional)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Path from olx.bg URL after the domain.
            </p>
          </div>
          <div>
            <Label>Location slug (optional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              e.g. <code>sofiya</code> or <code>oblast-plovdiv</code>
            </p>
          </div>

          <div>
            <Label>Min price (EUR, optional)</Label>
            <Input
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </div>
          <div>
            <Label>Max price (EUR, optional)</Label>
            <Input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>

          <div>
            <Label>Condition</Label>
            <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="">Any</option>
              <option value="new">New</option>
              <option value="used">Used</option>
            </Select>
          </div>
          <div>
            <Label>Seller type</Label>
            <Select value={sellerType} onChange={(e) => setSellerType(e.target.value)}>
              <option value="">Any</option>
              <option value="private">Private</option>
              <option value="business">Business</option>
            </Select>
          </div>

          <div>
            <Label>Sort by</Label>
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="">Default (newest)</option>
              <option value="created_at:desc">Newest first</option>
              <option value="filter_float_price:asc">Price: low → high</option>
              <option value="filter_float_price:desc">Price: high → low</option>
              <option value="relevance:desc">Relevance</option>
            </Select>
          </div>
          <div>
            <Label>Poll interval (min)</Label>
            <Input
              type="number"
              min={5}
              max={720}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Alert when EUR price ≤ (optional)</Label>
            <Input
              type="number"
              min={0}
              value={alertBelowEur}
              onChange={(e) => setAlertBelowEur(e.target.value)}
            />
          </div>

          {error ? (
            <div className="md:col-span-2 text-sm text-[var(--color-danger)]">{error}</div>
          ) : null}

          <div className="md:col-span-2 flex items-center gap-2">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SearchDetailPage() {
  const { id: idParam } = useParams({ from: "/dashboard/searches/$id" });
  const id = Number(idParam);

  const search = useSearch(id);

  const qp = search.data ? parseQueryParams(search.data.query_params) : null;
  const priceMin = qp ? Number(qp.price_min ?? 0) || undefined : undefined;
  const priceMax = qp ? Number(qp.price_max ?? 0) || undefined : undefined;

  const analytics = useAnalytics(id, 30, priceMin, priceMax);
  const listings = useListings({
    search_id: id,
    status: "active",
    limit: 200,
    price_eur_min: priceMin,
    price_eur_max: priceMax,
  }, { enabled: !!search.data });

  const poll = usePollSearch();
  const hide = useHideListing();
  const [editing, setEditing] = useState(false);

  const trend: TrendDatum[] = (analytics.data?.trend_eur ?? []).map((p) => ({
    date: p.day,
    avgEur: p.avg_eur ?? 0,
    count: p.n,
  }));

  const subtitle = search.data
    ? `${search.data.platform} · ${search.data.country} · every ${search.data.poll_interval_min}m`
    : undefined;

  return (
    <>
      <Topbar
        title={search.data?.name ?? "Search"}
        subtitle={subtitle}
        back={{ to: "/dashboard/searches", label: "Back to searches" }}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="h-4 w-4" />
              {editing ? "Cancel edit" : "Edit"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={poll.isPending}
              onClick={() => poll.mutate(id)}
            >
              <RefreshCw className={`h-4 w-4 ${poll.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {editing && search.data ? (
          <EditForm search={search.data} onDone={() => setEditing(false)} />
        ) : null}

        <div className={`grid grid-cols-1 gap-4 md:grid-cols-4 ${editing ? "mt-6" : ""}`}>
          <Stat
            label="Listings"
            value={(analytics.data?.listing_count ?? 0).toString()}
          />
          <Stat label="Min" value={formatEUR(analytics.data?.min_eur ?? null)} />
          <Stat label="Avg" value={formatEUR(analytics.data?.avg_eur ?? null)} />
          <Stat label="Max" value={formatEUR(analytics.data?.max_eur ?? null)} />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Price & volume — last 30 days</CardTitle>
            <CardDescription>Daily average EUR price and listing count</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                Not enough data yet.
              </div>
            ) : (
              <TrendChart data={trend} />
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Listings</CardTitle>
            <CardDescription>
              {listings.data?.total ?? 0} matched
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {(listings.data?.items ?? []).map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1 pr-4">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm hover:text-[var(--color-accent)]"
                    >
                      {l.title}
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <Badge variant={l.status === "active" ? "success" : "secondary"}>
                        {l.status}
                      </Badge>
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
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
