-- name: ReplaceListingPhotos :exec
-- Photos are replaced wholesale on each scrape (positions can shift, the carousel is the source of truth).
DELETE FROM listing_photos WHERE listing_id = ?;

-- name: InsertListingPhoto :exec
INSERT INTO listing_photos (listing_id, url, thumb_url, position)
VALUES (?, ?, ?, ?);

-- name: ListPhotosForListing :many
SELECT * FROM listing_photos WHERE listing_id = ? ORDER BY position;

-- name: ReplaceListingParams :exec
DELETE FROM listing_params WHERE listing_id = ?;

-- name: InsertListingParam :exec
INSERT INTO listing_params (listing_id, key, value) VALUES (?, ?, ?);

-- name: ListParamsForListing :many
SELECT key, value FROM listing_params WHERE listing_id = ?;
