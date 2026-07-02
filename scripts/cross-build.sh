#!/usr/bin/env bash
# Cross-compile the Go sidecar for all four release targets:
#   - windows/amd64
#   - darwin/amd64    (macOS Intel)
#   - darwin/arm64    (macOS Apple Silicon)
#   - linux/amd64
#
# CGO_ENABLED=0 throughout — modernc/sqlite is pure Go, no toolchain
# juggling required.
#
# Usage:
#   bash scripts/cross-build.sh                # auto-detect version from git
#   VERSION=1.2.3 bash scripts/cross-build.sh
#
# Output:
#   dist/bin/<goos>-<goarch>/the-great-find[.exe]
#
# MUST run inside WSL2 on Windows (see CLAUDE.md).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${VERSION:-$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")}"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "")"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo ">>> cross-building the-great-find $VERSION ($COMMIT, $DATE)"

LDFLAGS="-s -w \
  -X github.com/Hari-Hristov/the-great-find/backend/internal/version.Version=${VERSION} \
  -X github.com/Hari-Hristov/the-great-find/backend/internal/version.Commit=${COMMIT} \
  -X github.com/Hari-Hristov/the-great-find/backend/internal/version.Date=${DATE}"

TARGETS=(
  "windows/amd64"
  "darwin/amd64"
  "darwin/arm64"
  "linux/amd64"
)

for target in "${TARGETS[@]}"; do
  GOOS="${target%/*}"
  GOARCH="${target#*/}"
  EXT=""
  [[ "$GOOS" == "windows" ]] && EXT=".exe"

  OUT="$ROOT/dist/bin/${GOOS}-${GOARCH}/the-great-find${EXT}"
  mkdir -p "$(dirname "$OUT")"

  echo ">>> [${GOOS}/${GOARCH}] -> $OUT"
  ( cd "$ROOT/backend" && \
    GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED=0 \
    go build -trimpath -ldflags "$LDFLAGS" \
    -o "$OUT" \
    ./cmd/the-great-find )
done

echo ""
echo "done — binaries in dist/bin/"
ls -lh "$ROOT/dist/bin/"*/the-great-find*
