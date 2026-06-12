-- +goose Up
-- +goose StatementBegin
ALTER TABLE saved_searches ADD COLUMN max_listing_age_days INTEGER NOT NULL DEFAULT 90;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- SQLite doesn't support DROP COLUMN before 3.35; leave the column in place on rollback.
-- +goose StatementEnd
