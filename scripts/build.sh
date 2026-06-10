#!/usr/bin/env bash
# Build the production binary: regenerate API types, build the SPA, embed it, compile Go.
#
# Usage: bash scripts/build.sh
# Output: dist/the-great-find[.exe] for the host OS/arch.
#
# Stub for Phase 1 — real implementation lands in Phase 9.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ">>> [stub] gen-types: regenerate frontend/src/api/generated.ts from huma OpenAPI"
echo ">>> [stub] frontend: cd frontend && npm ci && npm run build"
echo ">>> [stub] backend: cd backend && go build -o ../dist/the-great-find ./cmd/the-great-find"

echo "build.sh stub — implementation deferred to Phase 9 (Cross-build + release)."
