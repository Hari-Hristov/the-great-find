-- name: InsertAlertSent :exec
-- The UNIQUE(search_id, listing_id, criteria_hash) constraint prevents double-firing.
-- Use INSERT OR IGNORE so re-evaluating the same listing+criteria is idempotent.
INSERT OR IGNORE INTO alerts_sent (
    search_id, listing_id, criteria_hash, criteria, email_status, os_status
) VALUES (
    ?, ?, ?, ?, ?, ?
);

-- name: AlertAlreadySent :one
SELECT EXISTS (
    SELECT 1 FROM alerts_sent
    WHERE search_id = ? AND listing_id = ? AND criteria_hash = ?
) AS already_sent;

-- name: ListRecentAlerts :many
SELECT * FROM alerts_sent
ORDER BY sent_at DESC
LIMIT ?;
