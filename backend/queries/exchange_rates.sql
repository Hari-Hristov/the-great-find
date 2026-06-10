-- name: UpsertExchangeRate :exec
INSERT INTO exchange_rates (date, base, quote, rate)
VALUES (?, ?, ?, ?)
ON CONFLICT (date, base, quote) DO UPDATE SET rate = excluded.rate;

-- name: GetLatestExchangeRate :one
SELECT * FROM exchange_rates
WHERE base = ? AND quote = ?
ORDER BY date DESC
LIMIT 1;

-- name: GetExchangeRateOnDate :one
SELECT * FROM exchange_rates
WHERE base = ? AND quote = ? AND date <= ?
ORDER BY date DESC
LIMIT 1;
