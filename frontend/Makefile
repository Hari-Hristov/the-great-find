NPM ?= npm

.PHONY: install
install:
	$(NPM) ci

.PHONY: typecheck
typecheck:
	$(NPM) run typecheck

.PHONY: lint
lint:
	$(NPM) run lint

.PHONY: check
check: typecheck lint
