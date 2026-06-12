import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  Alert,
  Analytics,
  CreateSavedSearchInput,
  Listing,
  ListingDetail,
  Photo,
  Param,
  PriceObservation,
  SavedSearch,
  UpdateSavedSearchInput,
} from "../types";

export const qk = {
  searches: ["searches"] as const,
  search: (id: number) => ["searches", id] as const,
  listings: (params: ListListingsParams) => ["listings", params] as const,
  listing: (id: number) => ["listings", id] as const,
  alerts: (limit: number) => ["alerts", limit] as const,
  analytics: (searchId: number, windowDays: number) =>
    ["analytics", searchId, windowDays] as const,
};

export function useSearches() {
  return useQuery({
    queryKey: qk.searches,
    queryFn: async () => {
      const r = await apiFetch<{ items: SavedSearch[] }>("/searches");
      return r.items ?? [];
    },
  });
}

export function useSearch(id: number, opts?: Partial<UseQueryOptions<SavedSearch>>) {
  return useQuery({
    queryKey: qk.search(id),
    queryFn: () => apiFetch<SavedSearch>(`/searches/${id}`),
    enabled: Number.isFinite(id) && id > 0,
    ...opts,
  });
}

export function useCreateSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedSearchInput) =>
      apiFetch<SavedSearch>("/searches", { method: "POST", json: input }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: qk.searches });
      apiFetch<void>(`/searches/${created.id}/poll`, { method: "POST" }).then(() => {
        qc.invalidateQueries({ queryKey: ["listings"] });
        qc.invalidateQueries({ queryKey: ["alerts"] });
      }).catch(() => {});
    },
  });
}

export function useUpdateSearch(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSavedSearchInput) =>
      apiFetch<SavedSearch>(`/searches/${id}`, { method: "PUT", json: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.searches });
      qc.invalidateQueries({ queryKey: qk.search(id) });
    },
  });
}

export function useDeleteSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/searches/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.searches }),
  });
}

export function usePollSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/searches/${id}/poll`, { method: "POST" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.listings({ search_id: id }) });
      qc.invalidateQueries({ queryKey: qk.alerts(100) });
    },
  });
}

export function usePollAllSearches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ count: number }>("/searches/poll", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export interface ListListingsParams {
  search_id?: number;
  status?: string;
  posted_after?: string;
  price_eur_min?: number;
  price_eur_max?: number;
  limit?: number;
  offset?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s.length > 0 ? `?${s}` : "";
}

export function useHideListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Listing>(`/listings/${id}`, { method: "PATCH", json: { status: "hidden" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useTagAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, color }: { id: number; label: string; color: string }) =>
      apiFetch<void>(`/alerts/${id}`, {
        method: "PATCH",
        json: { tag_label: label || null, tag_color: color || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useUnhideListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Listing>(`/listings/${id}`, { method: "PATCH", json: { status: "active" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useListings(params: ListListingsParams, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.listings(params),
    queryFn: async () => {
      const r = await apiFetch<{ items: Listing[]; total: number }>(
        `/listings${buildQuery(params as Record<string, string | number | undefined>)}`,
      );
      return { items: r.items ?? [], total: r.total ?? 0 };
    },
    staleTime: 0,
    enabled: opts?.enabled ?? true,
  });
}

export function useListing(id: number) {
  return useQuery({
    queryKey: qk.listing(id),
    queryFn: async () => {
      const r = await apiFetch<{
        listing: Listing;
        photos: Photo[];
        params: Param[];
        price_history: PriceObservation[];
      }>(`/listings/${id}`);
      const detail: ListingDetail = {
        ...r.listing,
        photos: r.photos ?? [],
        params: r.params ?? [],
        price_history: r.price_history ?? [],
      };
      return detail;
    },
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useAlerts(limit = 100) {
  return useQuery({
    queryKey: qk.alerts(limit),
    queryFn: async () => {
      const r = await apiFetch<{ items: Alert[] }>(`/alerts${buildQuery({ limit })}`);
      return r.items ?? [];
    },
    staleTime: 0,
  });
}

export function useAnalytics(
  searchId: number,
  windowDays = 30,
  priceEurMin?: number,
  priceEurMax?: number,
) {
  return useQuery({
    queryKey: [...qk.analytics(searchId, windowDays), priceEurMin, priceEurMax],
    queryFn: () =>
      apiFetch<Analytics>(
        `/analytics/searches/${searchId}${buildQuery({ window_days: windowDays, price_eur_min: priceEurMin, price_eur_max: priceEurMax })}`,
      ),
    enabled: Number.isFinite(searchId) && searchId > 0,
  });
}
