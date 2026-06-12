import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useCreateSearch } from "@/api/hooks/queries";

export const Route = createFileRoute("/dashboard/searches/new")({
  component: NewSearchPage,
});

function NewSearchPage() {
  const navigate = useNavigate();
  const create = useCreateSearch();
  const [name, setName] = useState("");
  const [queryText, setQueryText] = useState("");
  // Path-segment fields. olx.bg encodes category + location as PATH segments,
  // not query params — `category` accepts a multi-segment slug like
  // "elektronika/igri-i-konzoli", `location` accepts an oblast slug like
  // "oblast-sofiya-grad". See parser-config/olx-bg.json for the grammar.
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [sellerType, setSellerType] = useState<string>("");
  const [sort, setSort] = useState<string>("");
  const [alertBelowEur, setAlertBelowEur] = useState<string>("");
  const [interval, setInterval] = useState(30);
  const [maxListingAgeDays, setMaxListingAgeDays] = useState(90);
  const [keywordVariants, setKeywordVariants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => navigate({ to: "/dashboard/searches" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!queryText.trim()) {
      setError("Search keywords are required");
      return;
    }

    // Keys MUST match parser-config/olx-bg.json's path_segments + query_params.
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
      {
        onSuccess: goBack,
        onError: (err) => setError(err instanceof Error ? err.message : String(err)),
      },
    );
  };

  return (
    <>
      <Topbar title="New search" subtitle="Create a saved olx.bg query for the scheduler to monitor" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <Card className="mx-auto max-w-3xl">
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
                  What you'd type into the olx.bg search bar. We automatically also search common Bulgarian transliterations (e.g. nintendo → нинтендо). Add custom variants below if needed.
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
                  Path from olx.bg URL after the domain. Multi-segment ok (e.g. <code>elektronika/kompyutri/nastolni-kompyutri</code>). Known slugs are auto-resolved to the numeric API category ID.
                </p>
              </div>
              <div>
                <Label>Location slug (optional)</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  olx.bg's oblast/city slug, e.g. <code>sofiya</code> or <code>oblast-plovdiv</code>.
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
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating…" : "Create"}
                </Button>
                <Button type="button" variant="ghost" onClick={goBack}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
