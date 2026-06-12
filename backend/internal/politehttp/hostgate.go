// Package politehttp provides per-host rate-limiting primitives shared by
// every outbound HTTP path in the app (HTML scraper, JSON API client, future
// detail/enrich passes).
//
// One HostGate instance per process — wired into both the scraper and the
// apiclient at boot — so the politeness budget covers ALL traffic to a given
// host, not just one path's. Doubling that up would defeat the point.
package politehttp

import (
	"context"
	"errors"
	"math/rand"
	"sync"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
)

// HostGate enforces the politeness contract: at most N in-flight requests per
// host (almost always 1 for olx.bg), with a minimum spacing + random jitter
// between consecutive requests.
//
// The point isn't anti-anti-bot — it's that "be nice to the host" is the
// difference between a hobby tool and an unintentional DoS.
type HostGate struct {
	mu    sync.Mutex
	hosts map[string]*hostState
	rand  *rand.Rand
}

type hostState struct {
	semaphore chan struct{}
	last      time.Time
	mu        sync.Mutex
}

// NewHostGate builds an empty gate. Per-host state materializes lazily on first acquire.
func NewHostGate() *HostGate {
	return &HostGate{
		hosts: map[string]*hostState{},
		// A bespoke source so tests can swap it; sharing math/rand's global is fine here.
		rand: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Acquire blocks until the host has capacity AND the spacing has elapsed since
// the previous request to that host. ctx-aware throughout.
func (g *HostGate) Acquire(ctx context.Context, host string, robots parser.RobotsConfig) error {
	if host == "" {
		return errors.New("politehttp: empty host")
	}
	state := g.stateFor(host, robots.MaxInFlightPerHost)

	select {
	case state.semaphore <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}

	wait := g.computeWait(state, robots)
	if wait > 0 {
		t := time.NewTimer(wait)
		defer t.Stop()
		select {
		case <-t.C:
		case <-ctx.Done():
			// Release the slot we just took before bailing.
			<-state.semaphore
			return ctx.Err()
		}
	}

	state.mu.Lock()
	state.last = time.Now()
	state.mu.Unlock()
	return nil
}

// Release returns one slot to the host's semaphore. Always pair with Acquire.
func (g *HostGate) Release(host string) {
	g.mu.Lock()
	state, ok := g.hosts[host]
	g.mu.Unlock()
	if !ok {
		return
	}
	select {
	case <-state.semaphore:
	default:
		// Defensive: nothing to release. Don't panic — politeness violations are not crashes.
	}
}

func (g *HostGate) stateFor(host string, maxInFlight int) *hostState {
	g.mu.Lock()
	defer g.mu.Unlock()
	if state, ok := g.hosts[host]; ok {
		return state
	}
	if maxInFlight < 1 {
		maxInFlight = 1
	}
	state := &hostState{semaphore: make(chan struct{}, maxInFlight)}
	g.hosts[host] = state
	return state
}

// computeWait returns the delay needed before the next request to keep the
// configured min spacing + a small random jitter on top.
func (g *HostGate) computeWait(state *hostState, robots parser.RobotsConfig) time.Duration {
	state.mu.Lock()
	last := state.last
	state.mu.Unlock()
	if last.IsZero() {
		return 0
	}

	min := time.Duration(robots.MinRequestSpacingMs) * time.Millisecond
	jitterMs := robots.JitterMs
	if jitterMs > 0 {
		g.mu.Lock()
		extra := time.Duration(g.rand.Intn(jitterMs)) * time.Millisecond
		g.mu.Unlock()
		min += extra
	}

	elapsed := time.Since(last)
	if elapsed >= min {
		return 0
	}
	return min - elapsed
}
