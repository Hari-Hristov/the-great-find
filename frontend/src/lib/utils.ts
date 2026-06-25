import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eurFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEUR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return eurFormatter.format(value);
}

const dtFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return dtFormatter.format(d);
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  const diffMs = Date.now() - d;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function sortByPostedAtDesc<T extends { posted_at?: string }>(a: T, b: T): number {
  if (!a.posted_at && !b.posted_at) return 0;
  if (!a.posted_at) return 1;
  if (!b.posted_at) return -1;
  return b.posted_at.localeCompare(a.posted_at);
}

/**
 * Parse a JSON string with a fallback. The backend serializes saved-search
 * query params and alert criteria as JSON strings inside SQL TEXT columns;
 * the frontend reads them back per-row. This helper is used everywhere those
 * blobs are unpacked, so the try/catch boilerplate doesn't drift across
 * components.
 */
export function safeJSONParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
