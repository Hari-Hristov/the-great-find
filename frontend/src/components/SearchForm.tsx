import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useCreateSearch, useUpdateSearch, useConfig } from "@/api/hooks/queries";
import { humanizeApiError } from "@/api/client";
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

export function SearchForm(props: SearchFormProps) {
  const { mode, onSuccess, onCancel } = props;
  const config = useConfig();
  const create = useCreateSearch();
  const update = useUpdateSearch(mode === "edit" ? props.search.id : 0);

  const initialQp = mode === "edit" ? parseQueryParams(props.search.query_params) : {};

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

    const onError = (err: unknown) => setError(humanizeApiError(err));

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

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="md:col-span-2">
        <Label>Keywords</Label>
        <Input value={queryText} onChange={(e) => setQueryText(e.target.value)} required />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {mode === "create" ? (
            <>What you'd type into the olx.bg search bar. We automatically also search common Bulgarian transliterations (e.g. nintendo → нинтендо). Add custom variants below if needed.</>
          ) : (
            <>What you'd type into the olx.bg search bar.</>
          )}
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
        <Label>Location slug (optional)</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {mode === "create" ? (
            <>olx.bg's oblast/city slug, e.g. <code>sofiya</code> or <code>oblast-plovdiv</code>.</>
          ) : (
            <>e.g. <code>sofiya</code> or <code>oblast-plovdiv</code></>
          )}
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
