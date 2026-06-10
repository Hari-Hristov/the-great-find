package main

// Frontend assets are embedded into the binary at build time.
// The directive resolves relative to this file; the frontend dist
// is expected at the repo root when built via scripts/build.sh.
//
// Activated only when frontend/dist exists at build time. For dev,
// the Vite server serves the SPA on :5173 with a proxy to the API.

//go:generate echo "frontend/dist must be built before go build (see scripts/build.sh)"
