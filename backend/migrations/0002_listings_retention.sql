-- +goose Up
-- +goose StatementBegin

-- Retention: drop listings older than 90 days based on the listing's own age,
-- not when we last saw it. COALESCE handles rows where posted_at is NULL
-- (some apiclient paths leave it unset) — fall back to scraped_first_at so
-- nothing slips past the cutoff with NULL > anything semantics.
--
-- ON DELETE CASCADE on price_observations / listing_photos / listing_params /
-- alerts_sent already handles child rows; we only need to delete the parent.
--
-- SQLite has no scheduled triggers — only DML-bound ones. This fires on every
-- new listing insert (~30 per poll cycle, cheap at our row counts). A startup
-- sweep in cmd/the-great-find/main.go covers the case where the app sat idle
-- with no new inserts for >90 days.

CREATE TRIGGER listings_retention_prune
AFTER INSERT ON listings
BEGIN
    DELETE FROM listings
    WHERE datetime(COALESCE(posted_at, scraped_first_at))
          < datetime('now', '-90 days');
END;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS listings_retention_prune;
-- +goose StatementEnd
