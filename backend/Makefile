# Makefile — local dev helpers for the-great-find backend.
#
# Most CI-side build/release lives in scripts/. This file is for the
# developer-on-laptop workflow: run a fresh DB, regen sqlc code, run tests.

GOOSE       ?= goose
SQLC        ?= sqlc
GO          ?= go

DB_PATH     ?= ./dev.db
MIGRATIONS  := ./migrations

.PHONY: tidy
tidy:
	$(GO) mod tidy

.PHONY: fmt
fmt:
	$(GO) fmt ./...

.PHONY: vet
vet:
	$(GO) vet ./...

.PHONY: test
test:
	$(GO) test ./...

.PHONY: test-race
test-race:
	$(GO) test -race ./...

.PHONY: sqlc
sqlc:
	$(SQLC) generate

.PHONY: db-up
db-up:
	$(GOOSE) -dir $(MIGRATIONS) sqlite3 $(DB_PATH) up

.PHONY: db-down
db-down:
	$(GOOSE) -dir $(MIGRATIONS) sqlite3 $(DB_PATH) down

.PHONY: db-reset
db-reset:
	rm -f $(DB_PATH) $(DB_PATH)-shm $(DB_PATH)-wal
	$(MAKE) db-up

.PHONY: run
run:
	$(GO) run ./cmd/the-great-find

.PHONY: build
build:
	$(GO) build -o ../dist/the-great-find ./cmd/the-great-find

.PHONY: sync-parser-config
sync-parser-config:
	cp ../parser-config/olx-bg.json ./internal/parser/embedded/olx-bg.json
	@echo "Synced parser-config from repo root into the embed snapshot."
