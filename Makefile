# Root Makefile — delegates to backend/ and frontend/.
# Run `make ci` before pushing to replicate what both CI pipelines check.
#
# Backend targets require WSL2 (Go binaries are blocked by WDAC on native Windows).
# Run: wsl -- bash -c "cd /mnt/c/Users/<username>/projects/the-great-find && make ci"

.PHONY: ci
ci: backend-check frontend-check

.PHONY: backend-check
backend-check:
	$(MAKE) -C backend check

.PHONY: frontend-check
frontend-check:
	$(MAKE) -C frontend check
