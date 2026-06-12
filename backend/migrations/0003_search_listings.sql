-- +goose Up
-- +goose StatementBegin

-- Junction table tracking which search scraped which listing.
-- Populated by the scheduler on every UpsertListing call so the dashboard
-- can show all listings for a search, not just the ones that fired an alert.
CREATE TABLE search_listings (
    search_id   INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    first_seen  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (search_id, listing_id)
);
CREATE INDEX search_listings_listing_idx ON search_listings(listing_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS search_listings;
-- +goose StatementEnd
