-- +goose Up
-- +goose StatementBegin

-- Extend hard-delete window from 90 → 120 days to match the max_listing_age_days
-- option available in searches (120 days). Drop and recreate the trigger.
DROP TRIGGER IF EXISTS listings_retention_prune;

CREATE TRIGGER listings_retention_prune
AFTER INSERT ON listings
BEGIN
    DELETE FROM listings
    WHERE datetime(COALESCE(posted_at, scraped_first_at))
          < datetime('now', '-120 days');
END;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS listings_retention_prune;

CREATE TRIGGER listings_retention_prune
AFTER INSERT ON listings
BEGIN
    DELETE FROM listings
    WHERE datetime(COALESCE(posted_at, scraped_first_at))
          < datetime('now', '-90 days');
END;

-- +goose StatementEnd
