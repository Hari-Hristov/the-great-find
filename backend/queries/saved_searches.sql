-- name: CreateSavedSearch :one
INSERT INTO saved_searches (
    name, platform, country, query_params, alert_criteria, poll_interval_min, active
) VALUES (
    ?, ?, ?, ?, ?, ?, ?
)
RETURNING *;

-- name: GetSavedSearch :one
SELECT * FROM saved_searches WHERE id = ?;

-- name: ListActiveSavedSearches :many
SELECT * FROM saved_searches WHERE active = 1 ORDER BY id;

-- name: ListAllSavedSearches :many
SELECT * FROM saved_searches ORDER BY id;

-- name: UpdateSavedSearchPolledAt :exec
UPDATE saved_searches SET last_polled_at = ? WHERE id = ?;

-- name: SetSavedSearchActive :exec
UPDATE saved_searches SET active = ? WHERE id = ?;

-- name: ListSearchesDueForCatchup :many
-- Searches whose last_polled_at is older than 2x their poll interval (or never polled).
-- The scheduler runs this on startup to immediately poll any drift.
SELECT * FROM saved_searches
WHERE active = 1
  AND (
    last_polled_at IS NULL
    OR datetime(last_polled_at) < datetime('now', printf('-%d minutes', poll_interval_min * 2))
  );

-- name: DeleteSavedSearch :exec
DELETE FROM saved_searches WHERE id = ?;
