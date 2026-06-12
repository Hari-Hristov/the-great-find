-- +goose Up
-- +goose StatementBegin
ALTER TABLE alerts_sent ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE alerts_sent DROP COLUMN flagged;
-- +goose StatementEnd
