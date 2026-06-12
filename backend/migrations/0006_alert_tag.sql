-- +goose Up
-- +goose StatementBegin
ALTER TABLE alerts_sent ADD COLUMN tag_label TEXT;
ALTER TABLE alerts_sent ADD COLUMN tag_color TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE alerts_sent DROP COLUMN tag_label;
ALTER TABLE alerts_sent DROP COLUMN tag_color;
-- +goose StatementEnd
