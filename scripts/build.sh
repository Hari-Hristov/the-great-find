#!/usr/bin/env bash
# Build the Electron app + Go sidecar for the host OS+arch.
#
# Usage:
#   bash scripts/build.sh                              # auto-detect version from git
#   VERSION=1.2.3 bash scripts/build.sh                # pin version explicitly
#
# Outputs:
#   dist/bin/<goos>-<goarch>/the-great-find[.exe]      # Go sidecar binary
#   dist/electron/<platform>/...                       # electron-builder artifact
#
# MUST run inside WSL2 on Windows — WDAC blocks Go binaries compiled from
# the native Windows shell (see CLAUDE.md → "Backend & test execution").

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Resolve metadata. -dirty is appended automatically when there are uncommitted changes.
VERSION="${VERSION:-$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")}"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "")"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo ">>> building the-great-find $VERSION ($COMMIT, $DATE)"

LDFLAGS="-s -w \
  -X github.com/Hari-Hristov/the-great-find/backend/internal/version.Version=${VERSION} \
  -X github.com/Hari-Hristov/the-great-find/backend/internal/version.Commit=${COMMIT} \
  -X github.com/Hari-Hristov/the-great-find/backend/internal/version.Date=${DATE}"

# Detect host platform
HOST_OS="$(go env GOOS)"
HOST_ARCH="$(go env GOARCH)"
EXT=""
[[ "$HOST_OS" == "windows" ]] && EXT=".exe"

# On macOS the electron-builder config targets the *universal* DMG, which
# requires BOTH darwin-amd64 and darwin-arm64 binaries side-by-side under
# dist/bin/ (the sidecar picks the right one at runtime via process.arch).
# So on darwin hosts we cross-build both arches; on windows/linux we just
# build the host arch.
build_go() {
  local goos="$1" goarch="$2" ext=""
  [[ "$goos" == "windows" ]] && ext=".exe"
  local out="$ROOT/dist/bin/${goos}-${goarch}/the-great-find${ext}"
  mkdir -p "$(dirname "$out")"
  echo ">>> go build ${goos}/${goarch} -> $out"
  ( cd "$ROOT/backend" && GOOS="$goos" GOARCH="$goarch" CGO_ENABLED=0 \
    go build -trimpath -ldflags "$LDFLAGS" \
    -o "$out" \
    ./cmd/the-great-find )
}

echo ">>> [1/3] go build"
if [[ "$HOST_OS" == "darwin" ]]; then
  build_go darwin amd64
  build_go darwin arm64
else
  build_go "$HOST_OS" "$HOST_ARCH"
fi

echo ">>> [2/3] frontend renderer + electron main/preload"
( cd "$ROOT/frontend" && \
  if [ ! -d node_modules ]; then npm ci; fi && \
  VITE_APP_VERSION="$VERSION" npm run build:electron )

echo ">>> [3/3] electron-builder (host platform)"
( cd "$ROOT/frontend" && \
  npx electron-builder --publish=never \
    --config.extraMetadata.version="$VERSION" )

echo ""
echo "done — artifacts in dist/"
