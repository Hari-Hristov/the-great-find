import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useCreateSearch, useUpdateSearch, useConfig } from "@/api/hooks/queries";
import { safeJSONParse } from "@/lib/utils";
import type { SavedSearch } from "@/api/types";

type CreateProps = {
  mode: "create";
  onSuccess: () => void;
  onCancel: () => void;
};

type EditProps = {
  mode: "edit";
  search: SavedSearch;
  onSuccess: () => void;
  onCancel: () => void;
};

export type SearchFormProps = CreateProps | EditProps;

function parseAlertBelowEur(raw?: string): string {
  const obj = safeJSONParse<{ kind?: string; price_eur?: number }>(raw, {});
  if (obj.kind === "price_below" && typeof obj.price_eur === "number") {
    return String(obj.price_eur);
  }
  return "";
}

export function SearchForm(props: SearchFormProps) {
  const { mode, onSuccess, onCancel } = props;
  const config = useConfig();
  const create = useCreateSearch();
  const update = useUpdateSearch(mode === "edit" ? props.search.id : 0);

  // Pre-allocate stable ids for every field so labels can reference inputs via
  // htmlFor/id — sibling label+input pairs are not screen-reader-associated.
  const ids = {
    name: useId(),
    query: useId(),
    variants: useId(),
    category: useId(),
    location: useId(),
    minPrice: useId(),
    maxPrice: useId(),
    condition: useId(),
    sellerType: useId(),
    sort: useId(),
    ageCutoff: useId(),
    interval: useId(),
    alertBelow: useId(),
  };

  const initialQp = mode === "edit"
    ? safeJSONParse<Record<string, string | string[]>>(props.search.query_params, {})
    : {};

  const [name, setName] = useState(mode === "edit" ? props.search.name : "");
  const [queryText, setQueryText] = useState(
    mode === "edit" ? ((initialQp.keyword as string) ?? "") : "",
  );
  const [category, setCategory] = useState(
    mode === "edit" ? ((initialQp.category as string) ?? "") : "",
  );
  const [location, setLocation] = useState(
    mode === "edit" ? ((initialQp.location as string) ?? "") : "",
  );
  const [minPrice, setMinPrice] = useState(
    mode === "edit" ? ((initialQp.price_min as string) ?? "") : "",
  );
  const [maxPrice, setMaxPrice] = useState(
    mode === "edit" ? ((initialQp.price_max as string) ?? "") : "",
  );
  const [condition, setCondition] = useState(
    mode === "edit" ? ((initialQp.condition as string) ?? "") : "",
  );
  const [sellerType, setSellerType] = useState(
    mode === "edit" ? ((initialQp.seller_type as string) ?? "") : "",
  );
  const [sort, setSort] = useState(
    mode === "edit" ? ((initialQp.sort as string) ?? "") : "",
  );
  const [alertBelowEur, setAlertBelowEur] = useState(
    mode === "edit" ? parseAlertBelowEur(props.search.alert_criteria) : "",
  );
  const [interval, setInterval] = useState(
    mode === "edit" ? props.search.poll_interval_min : 30,
  );
  const [maxListingAgeDays, setMaxListingAgeDays] = useState(
    mode === "edit" ? (props.search.max_listing_age_days || 90) : 90,
  );
  const [keywordVariants, setKeywordVariants] = useState<string[]>(
    mode === "edit" && Array.isArray(initialQp.keyword_variants)
      ? (initialQp.keyword_variants as string[])
      : [],
  );
  const [error, setError] = useState<string | null>(null);

  const isPending = mode === "create" ? create.isPending : update.isPending;
  const datalistId = mode === "create" ? "category-options" : "category-options-edit";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!queryText.trim()) {
      setError(mode === "create" ? "Search keywords are required" : "Keywords are required");
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

    const onError = (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err));

    if (mode === "create") {
      create.mutate(
        {
          name: name.trim(),
          platform: "olx",
          country: "BG",
          query_params: queryParams,
          alert_criteria: alertCriteria,
          poll_interval_min: interval,
          max_listing_age_days: maxListingAgeDays,
          active: true,
        },
        { onSuccess, onError },
      );
    } else {
      update.mutate(
        {
          name: name.trim(),
          query_params: queryParams,
          alert_criteria: alertCriteria,
          poll_interval_min: interval,
          max_listing_age_days: maxListingAgeDays,
          active: props.search.active,
        },
        { onSuccess, onError },
      );
    }
  };

  // Default-open the Advanced section when editing AND any Tier-2 field has a
  // non-default value — operators editing a tuned search shouldn't have to
  // hunt for the knobs they already set.
  const advancedHasContent =
    keywordVariants.length > 0 ||
    !!category ||
    !!location ||
    !!minPrice ||
    !!condition ||
    !!sellerType ||
    !!sort ||
    maxListingAgeDays !== 90 ||
    interval !== 30;

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Tier 1 — the four fields almost every operator wants. Kept always
          visible at the top regardless of mode. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor={ids.name}>Name</Label>
          <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor={ids.query}>Keywords</Label>
          <Input id={ids.query} value={queryText} onChange={(e) => setQueryText(e.target.value)} required />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {mode === "create" ? (
              <>What you'd type into the olx.bg search bar. We automatically also search common Bulgarian transliterations (e.g. nintendo → нинтендо). Add custom variants in Advanced if needed.</>
            ) : (
              <>What you'd type into the olx.bg search bar.</>
            )}
          </p>
        </div>

        <div>
          <Label htmlFor={ids.maxPrice}>Max price (EUR, optional)</Label>
          <Input
            id={ids.maxPrice}
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={ids.alertBelow}>Alert when EUR price ≤ (optional)</Label>
          <Input
            id={ids.alertBelow}
            type="number"
            min={0}
            value={alertBelowEur}
            onChange={(e) => setAlertBelowEur(e.target.value)}
          />
        </div>
      </div>

      {/* Tier 2 — operator can flip every other knob, but the surface stays
          calm until they ask for it. <details> is keyboard-accessible by
          default and survives a refresh without state. */}
      <details
        open={mode === "edit" && advancedHasContent}
        className="rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] open:bg-[var(--color-bg-card)]/40"
      >
        <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)]">
          <span className="flex items-center gap-2">
            <span aria-hidden className="text-[var(--color-accent)]">▸</span>
            Advanced filters
          </span>
          <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            variants · location · sort · cadence
          </span>
        </summary>

        <div className="grid grid-cols-1 gap-3 border-t border-[var(--color-border-subtle)] p-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor={ids.variants}>Search variants (optional)</Label>
            <div id={ids.variants}>
              {keywordVariants.map((v, i) => (
                <div key={i} className="mt-1 flex items-center gap-2">
                  <Input
                    value={v}
                    aria-label={`Variant ${i + 1}`}
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
          </div>

          <div>
            <Label htmlFor={ids.category}>Category slug (optional)</Label>
            <Input
              id={ids.category}
              list={datalistId}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. elektronika/kompyutri"
            />
            <datalist id={datalistId}>
              {Object.keys(config.data?.categories ?? {}).sort().map((slug) => (
                <option key={slug} value={slug} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Path from olx.bg URL after the domain — known slugs are suggested as you type.
            </p>
          </div>
          <div>
            <Label htmlFor={ids.location}>Location slug (optional)</Label>
            <Input id={ids.location} value={location} onChange={(e) => setLocation(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {mode === "create" ? (
                <>olx.bg's oblast/city slug, e.g. <code>sofiya</code> or <code>oblast-plovdiv</code>.</>
              ) : (
                <>e.g. <code>sofiya</code> or <code>oblast-plovdiv</code></>
              )}
            </p>
          </div>

          <div>
            <Label htmlFor={ids.minPrice}>Min price (EUR, optional)</Label>
            <Input
              id={ids.minPrice}
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor={ids.condition}>Condition</Label>
            <Select id={ids.condition} value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="">Any</option>
              <option value="new">New</option>
              <option value="used">Used</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={ids.sellerType}>Seller type</Label>
            <Select id={ids.sellerType} value={sellerType} onChange={(e) => setSellerType(e.target.value)}>
              <option value="">Any</option>
              <option value="private">Private</option>
              <option value="business">Business</option>
            </Select>
          </div>

          <div>
            <Label htmlFor={ids.sort}>Sort by</Label>
            <Select id={ids.sort} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="">Default (newest)</option>
              <option value="created_at:desc">Newest first</option>
              <option value="filter_float_price:asc">Price: low → high</option>
              <option value="filter_float_price:desc">Price: high → low</option>
              <option value="relevance:desc">Relevance</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={ids.ageCutoff}>Listing age cutoff (days)</Label>
            <Select id={ids.ageCutoff} value={String(maxListingAgeDays)} onChange={(e) => setMaxListingAgeDays(Number(e.target.value))}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="120">120 days</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={ids.interval}>Poll interval (min)</Label>
            <Input
              id={ids.interval}
              type="number"
              min={5}
              max={720}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>
        </div>
      </details>

      {error ? (
        <div className="text-sm text-[var(--color-danger)]" role="alert">{error}</div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {mode === "create"
            ? (isPending ? "Creating…" : "Create")
            : (isPending ? "Saving…" : "Save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
