-- name: InsertPriceObservation :exec
INSERT INTO price_observations (
    listing_id, event_type, price_amount, price_currency, status, title_hash, description_hash
) VALUES (
    ?, ?, ?, ?, ?, ?, ?
);

-- name: ListObservationsForListing :many
SELECT * FROM price_observations
WHERE listing_id = ?
ORDER BY observed_at DESC
LIMIT ?;

-- name: LowestPriceLastNDaysForCategory :one
-- Negotiable prices are excluded from price-floor stats (they're not real offers).
-- NULL prices ("by negotiation") are excluded by the IS NOT NULL filter.
SELECT MIN(po.price_amount) AS min_price
FROM price_observations po
JOIN listings l ON l.id = po.listing_id
WHERE l.category_id = ?
  AND l.price_negotiable = 0
  AND po.observed_at >= datetime('now', printf('-%d days', ?))
  AND po.price_amount IS NOT NULL;

-- name: DailyAvgPriceLastNDaysForCategory :many
SELECT
    date(po.observed_at) AS day,
    AVG(po.price_amount) AS avg_price,
    COUNT(*)             AS observations
FROM price_observations po
JOIN listings l ON l.id = po.listing_id
WHERE l.category_id = ?
  AND l.price_negotiable = 0
  AND po.observed_at >= datetime('now', printf('-%d days', ?))
  AND po.price_amount IS NOT NULL
GROUP BY day
ORDER BY day;

-- name: NewListingsRateLastNDays :many
SELECT
    date(observed_at) AS day,
    COUNT(*)          AS new_count
FROM price_observations
WHERE event_type = 'created'
  AND observed_at >= datetime('now', printf('-%d days', ?))
GROUP BY day
ORDER BY day;
