export interface SavedSearch {
  id: number;
  name: string;
  platform: string;
  country: string;
  query_params: string;
  alert_criteria?: string;
  poll_interval_min: number;
  active: boolean;
  created_at: string;
  last_polled_at?: string;
}

export interface CreateSavedSearchInput {
  name: string;
  platform: string;
  country: string;
  query_params: Record<string, string | string[]>;
  alert_criteria?: Record<string, unknown>;
  poll_interval_min: number;
  active: boolean;
}

export type UpdateSavedSearchInput = Partial<Omit<CreateSavedSearchInput, "platform" | "country">>;

export interface Listing {
  id: number;
  platform: string;
  country: string;
  external_id: string;
  url: string;
  title: string;
  description?: string;
  price_amount?: number;
  price_currency?: string;
  price_eur?: number;
  price_negotiable: boolean;
  category_id?: string;
  location_region?: string;
  location_city?: string;
  posted_at?: string;
  scraped_first_at: string;
  scraped_last_at: string;
  status: string;
  primary_image_url?: string;
  promoted_top: boolean;
}

export interface Photo {
  url: string;
  thumb_url?: string;
  position: number;
}

export interface Param {
  key: string;
  value?: string;
}

export interface PriceObservation {
  observed_at: string;
  event_type: string;
  price_amount?: number;
  price_currency?: string;
  price_eur?: number;
}

export interface ListingDetail extends Listing {
  photos: Photo[];
  params: Param[];
  price_history: PriceObservation[];
}

export interface Alert {
  id: number;
  search_id: number;
  listing_id: number;
  criteria_hash: string;
  criteria: string;
  sent_at: string;
  listing_title?: string;
  listing_url?: string;
}

export interface TrendPoint {
  day: string;
  avg_eur: number;
  n: number;
}

export interface Analytics {
  search_id: number;
  window_days: number;
  listing_count: number;
  min_eur?: number;
  max_eur?: number;
  avg_eur?: number;
  trend_eur: TrendPoint[];
}
