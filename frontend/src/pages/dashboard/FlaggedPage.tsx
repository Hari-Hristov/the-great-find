import { useMemo } from "react";
import { Eye } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useListings, useUnhideListing } from "@/api/hooks/queries";
import { formatEUR, relativeTime, sortByPostedAtDesc } from "@/lib/utils";
import { safeHref } from "@/lib/url";
import type { Listing } from "@/api/types";

export function FlaggedPage() {
  const listings = useListings({ status: "hidden", limit: 500 });
  const unhide = useUnhideListing();

  const items = useMemo(
    () => [...(listings.data?.items ?? [])].sort(sortByPostedAtDesc),
    [listings.data],
  );

  const removedCount = useMemo(
    () => items.filter((l) => l.status === "removed" || l.status === "sold").length,
    [items],
  );
  const activeCount = useMemo(
    () => items.filter((l) => l.status === "active").length,
    [items],
  );

  return (
    <>
      <Topbar
        title="Flagged"
        subtitle="Listings you've hidden — won't show up or trigger alerts"
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <FlaggedStrip
          total={items.length}
          active={activeCount}
          gone={removedCount}
        />

        <div className="mt-8">
          <FlaggedFeed
            items={items}
            loading={listings.isLoading}
            isPending={unhide.isPending}
            onUnhide={(id) => unhide.mutate(id)}
          />
        </div>
      </div>
    </>
  );
}

function FlaggedStrip({
  total,
  active,
  gone,
}: {
  total: number;
  active: number;
  gone: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[var(--color-border-subtle)] pb-4 md:grid-cols-3">
      <StripCell label="Total flagged" value={String(total)} />
      <StripCell label="Still active" value={String(active)} />
      <StripCell label="Removed / sold" value={String(gone)} />
    </dl>
  );
}

function StripCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
        {value}
      </dd>
    </div>
  );
}

interface FlaggedFeedProps {
  items: Listing[];
  loading: boolean;
  isPending: boolean;
  onUnhide: (id: number) => void;
}

function FlaggedFeed({ items, loading, isPending, onUnhide }: FlaggedFeedProps) {
  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Hidden listings
        </h2>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Hidden listings
        </h2>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-[var(--color-text-primary)]">
              No hidden listings.
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Hit the eye-off icon on any listing to hide it from alerts and
              search results.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Hidden listings
      </h2>
      <ul className="divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]">
        {items.map((l) => (
          <FlaggedRow
            key={l.id}
            listing={l}
            isPending={isPending}
            onUnhide={onUnhide}
          />
        ))}
      </ul>
    </section>
  );
}

function FlaggedRow({
  listing: l,
  isPending,
  onUnhide,
}: {
  listing: Listing;
  isPending: boolean;
  onUnhide: (id: number) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <a
          href={safeHref(l.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
        >
          {l.title}
        </a>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <ListingStatusBadge status={l.status} />
          {l.location_city ? (
            <>
              <span>{l.location_city}</span>
              <span>·</span>
            </>
          ) : null}
          {l.posted_at ? (
            <span>posted {relativeTime(l.posted_at)}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {l.price_eur != null ? (
          <span className="font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
            {formatEUR(l.price_eur)}
          </span>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Unhide listing"
          disabled={isPending}
          onClick={() => onUnhide(l.id)}
          className="h-7 w-7 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function ListingStatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        active
      </span>
    );
  }
  if (status === "removed" || status === "sold") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--color-danger)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-danger)]">
        {status}
      </span>
    );
  }
  return null;
}
