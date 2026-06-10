#!/usr/bin/env bash
# Generate frontend TypeScript types from the huma-generated OpenAPI spec.
#
# Flow:
#   1. Run a tiny Go program that boots huma in "dump-spec" mode and writes openapi.json
#   2. Run openapi-typescript to convert it into frontend/src/api/generated.ts
#
# Usage: bash scripts/gen-types.sh
# Wired as `npm prebuild` and as a CI check (drift detection) in Phase 9.
#
# Stub for Phase 1 — real implementation lands in Phase 5 (when huma routes exist).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ">>> [stub] backend: go run ./cmd/dump-openapi > frontend/openapi.json"
echo ">>> [stub] frontend: npx openapi-typescript frontend/openapi.json -o frontend/src/api/generated.ts"

echo "gen-types.sh stub — implementation deferred to Phase 5 (API + SSE)."
