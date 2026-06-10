#!/usr/bin/env bash
# Cross-compile the binary for all release targets:
#   - windows/amd64
#   - darwin/amd64    (macOS Intel)
#   - darwin/arm64    (macOS Apple Silicon)
#   - linux/amd64
#
# Usage: bash scripts/cross-build.sh
# Output: dist/{os}-{arch}/the-great-find[.exe]
#
# Stub for Phase 1 — real implementation lands in Phase 9.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ">>> [stub] frontend: build once (shared across all OS targets via embed.FS)"
echo ">>> [stub] backend: GOOS=windows GOARCH=amd64 go build ..."
echo ">>> [stub] backend: GOOS=darwin  GOARCH=amd64 go build ..."
echo ">>> [stub] backend: GOOS=darwin  GOARCH=arm64 go build ..."
echo ">>> [stub] backend: GOOS=linux   GOARCH=amd64 go build ..."
echo ">>> [stub] darwin: bundle into .app with LSUIElement=true"

echo "cross-build.sh stub — implementation deferred to Phase 9."
