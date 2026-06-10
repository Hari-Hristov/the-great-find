-- name: UpsertListing :one
-- Insert-or-update on the (platform, country, external_id) natural key.
-- Returns the row plus a flag indicating whether it was newly created (for the scheduler/alerts logic).
INSERT INTO listings (
    platform, country, external_id, url, title, description,
    price_amount, price_currency, price_negotiable,
    category_id, location_region, location_city, location_lat, location_lng,
    posted_at, status,
    seller_external_id, seller_name, seller_type, seller_registered_at,
    primary_image_url, promoted_top, promoted_highlighted,
    params, raw_payload, title_hash, description_hash
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?
)
ON CONFLICT (platform, country, external_id) DO UPDATE SET
    url                  = excluded.url,
    title                = excluded.title,
    description          = excluded.description,
    price_amount         = excluded.price_amount,
    price_currency       = excluded.price_currency,
    price_negotiable     = excluded.price_negotiable,
    category_id          = excluded.category_id,
    location_region      = excluded.location_region,
    location_city        = excluded.location_city,
    location_lat         = excluded.location_lat,
    location_lng         = excluded.location_lng,
    posted_at            = excluded.posted_at,
    scraped_last_at      = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    status               = excluded.status,
    seller_external_id   = excluded.seller_external_id,
    seller_name          = excluded.seller_name,
    seller_type          = excluded.seller_type,
    seller_registered_at = excluded.seller_registered_at,
    primary_image_url    = excluded.primary_image_url,
    promoted_top         = excluded.promoted_top,
    promoted_highlighted = excluded.promoted_highlighted,
    params               = excluded.params,
    raw_payload          = excluded.raw_payload,
    title_hash           = excluded.title_hash,
    description_hash     = excluded.description_hash
RETURNING *;

-- name: GetListingByExternalID :one
SELECT * FROM listings
WHERE platform = ? AND country = ? AND external_id = ?;

-- name: GetListing :one
SELECT * FROM listings WHERE id = ?;

-- name: ListListingsByStatus :many
SELECT * FROM listings WHERE status = ? ORDER BY scraped_last_at DESC LIMIT ? OFFSET ?;

-- name: SetListingStatus :exec
UPDATE listings SET status = ?, scraped_last_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?;

-- name: MarkStaleListingsRemoved :exec
-- Daily sweep: any active listing not seen in N days gets soft-deleted.
UPDATE listings
SET status = 'removed', scraped_last_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status = 'active'
  AND datetime(scraped_last_at) < datetime('now', printf('-%d days', ?));
