import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { EyeOff, Pencil, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { useHideListing, useListings, usePollSearch, useSearch, useUpdateSearch, useConfig } from "@/api/hooks/queries";
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
  const config = useConfig();
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
  const [maxListingAgeDays, setMaxListingAgeDays] = useState(search.max_listing_age_days || 90);
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
        max_listing_age_days: maxListingAgeDays,
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
            <Input
              list="category-options-edit"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. elektronika/kompyutri"
            />
            <datalist id="category-options-edit">
              {Object.keys(config.data?.categories ?? {}).sort().map((slug) => (
                <option key={slug} value={slug} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Path from olx.bg URL after the domain — known slugs are suggested as you type.
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
            <Label>Listing age cutoff (days)</Label>
            <Select value={String(maxListingAgeDays)} onChange={(e) => setMaxListingAgeDays(Number(e.target.value))}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="120">120 days</option>
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
            {search.data && <DetailsPopover search={search.data} />}
            <Link
              to="/dashboard/searches/$id/analytics"
              params={{ id: idParam }}
              className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-button)] border border-[var(--color-border-subtle)] px-3 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-base)]"
            >
              Analytics
            </Link>
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

        <Card className={editing ? "mt-6" : ""}>
          <CardHeader>
            <CardTitle>Listings</CardTitle>
            <CardDescription>
              {listings.data?.total ?? 0} matched
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {[...(listings.data?.items ?? [])].sort((a, b) => {
                if (!a.posted_at && !b.posted_at) return 0;
                if (!a.posted_at) return 1;
                if (!b.posted_at) return -1;
                return b.posted_at.localeCompare(a.posted_at);
              }).map((l) => (
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

function DetailsPopover({ search }: { search: SavedSearch }) {
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
      <Button
        size="sm"
        variant={open ? "secondary" : "ghost"}
        onClick={() => setOpen((v) => !v)}
      >
        <ShieldAlert className="h-4 w-4" />
        Details
      </Button>

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
