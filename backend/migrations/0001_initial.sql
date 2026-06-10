-- +goose Up
-- +goose StatementBegin

-- Single-user local app. No users table — the OS user account IS the security boundary.
-- All timestamps are UTC ISO-8601. Currency is always (amount, currency_code) pairs.
-- Soft-delete only — listings flip status, never get hard-deleted.

CREATE TABLE saved_searches (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    platform            TEXT    NOT NULL DEFAULT 'olx',
    country             TEXT    NOT NULL DEFAULT 'BG',
    query_params        TEXT    NOT NULL,
    alert_criteria      TEXT,
    poll_interval_min   INTEGER NOT NULL DEFAULT 30,
    active              INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_polled_at      TEXT
);

CREATE TABLE listings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    platform                TEXT    NOT NULL DEFAULT 'olx',
    country                 TEXT    NOT NULL DEFAULT 'BG',
    external_id             TEXT    NOT NULL,
    url                     TEXT    NOT NULL,
    title                   TEXT    NOT NULL,
    description             TEXT,
    price_amount            REAL,
    price_currency          TEXT,
    price_negotiable        INTEGER NOT NULL DEFAULT 0,
    category_id             TEXT,
    location_region         TEXT,
    location_city           TEXT,
    location_lat            REAL,
    location_lng            REAL,
    posted_at               TEXT,
    scraped_first_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    scraped_last_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    status                  TEXT    NOT NULL DEFAULT 'active',
    seller_external_id      TEXT,
    seller_name             TEXT,
    seller_type             TEXT,
    seller_registered_at    TEXT,
    primary_image_url       TEXT,
    promoted_top            INTEGER NOT NULL DEFAULT 0,
    promoted_highlighted    INTEGER NOT NULL DEFAULT 0,
    params                  TEXT,
    raw_payload             TEXT,
    title_hash              TEXT,
    description_hash        TEXT,
    dedup_group_id          INTEGER,
    UNIQUE (platform, country, external_id)
);
CREATE INDEX listings_status_idx   ON listings(status);
CREATE INDEX listings_category_idx ON listings(category_id);

CREATE TABLE price_observations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id          INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    observed_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    event_type          TEXT    NOT NULL,
    price_amount        REAL,
    price_currency      TEXT,
    status              TEXT,
    title_hash          TEXT,
    description_hash    TEXT
);
CREATE INDEX price_obs_listing_time_idx ON price_observations(listing_id, observed_at DESC);
CREATE INDEX price_obs_event_time_idx   ON price_observations(event_type, observed_at DESC);

CREATE TABLE listing_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url         TEXT    NOT NULL,
    thumb_url   TEXT,
    position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX listing_photos_listing_idx ON listing_photos(listing_id, position);

CREATE TABLE listing_params (
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    key         TEXT    NOT NULL,
    value       TEXT,
    PRIMARY KEY (listing_id, key)
);
CREATE INDEX listing_params_kv_idx ON listing_params(key, value);

CREATE TABLE alerts_sent (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id       INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    listing_id      INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    criteria_hash   TEXT    NOT NULL,
    criteria        TEXT    NOT NULL,
    sent_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    email_status    TEXT,
    os_status       TEXT,
    UNIQUE (search_id, listing_id, criteria_hash)
);

CREATE TABLE exchange_rates (
    date    TEXT NOT NULL,
    base    TEXT NOT NULL,
    quote   TEXT NOT NULL,
    rate    REAL NOT NULL,
    PRIMARY KEY (date, base, quote)
);

CREATE TABLE app_state (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS app_state;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS alerts_sent;
DROP TABLE IF EXISTS listing_params;
DROP TABLE IF EXISTS listing_photos;
DROP TABLE IF EXISTS price_observations;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS saved_searches;
-- +goose StatementEnd
