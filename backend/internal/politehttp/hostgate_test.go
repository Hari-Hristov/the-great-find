package politehttp

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
)

func robots(maxInFlight, spacingMs, jitterMs int) parser.RobotsConfig {
	return parser.RobotsConfig{
		RespectRobotsTxt:    true,
		UserAgent:           "test-agent",
		MinRequestSpacingMs: spacingMs,
		JitterMs:            jitterMs,
		MaxInFlightPerHost:  maxInFlight,
	}
}

func TestHostGate_RejectsEmptyHost(t *testing.T) {
	g := NewHostGate()
	err := g.Acquire(context.Background(), "", robots(1, 0, 0))
	if err == nil {
		t.Fatal("expected error for empty host")
	}
}

func TestHostGate_SerializesRequestsPerHost(t *testing.T) {
	g := NewHostGate()
	r := robots(1, 0, 0)
	host := "olx.bg"

	if err := g.Acquire(context.Background(), host, r); err != nil {
		t.Fatalf("first acquire failed: %v", err)
	}

	// Second acquire should block until release. Spawn it, give it a tick, verify it's still blocked.
	var second atomic.Bool
	done := make(chan struct{})
	go func() {
		_ = g.Acquire(context.Background(), host, r)
		second.Store(true)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond)
	if second.Load() {
		t.Fatal("second acquire should still be blocked while first holds the slot")
	}

	g.Release(host)

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("second acquire didn't unblock after release")
	}
	g.Release(host)
}

func TestHostGate_AllowsMultipleHostsConcurrently(t *testing.T) {
	g := NewHostGate()
	r := robots(1, 0, 0)

	if err := g.Acquire(context.Background(), "host-a.example", r); err != nil {
		t.Fatalf("acquire host-a: %v", err)
	}
	// Different host should not be blocked by host-a's slot.
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if err := g.Acquire(ctx, "host-b.example", r); err != nil {
		t.Fatalf("acquire host-b should not block: %v", err)
	}

	g.Release("host-a.example")
	g.Release("host-b.example")
}

func TestHostGate_EnforcesMinSpacing(t *testing.T) {
	g := NewHostGate()
	r := robots(1, 50, 0) // 50ms spacing, no jitter
	host := "olx.bg"

	if err := g.Acquire(context.Background(), host, r); err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	g.Release(host)

	start := time.Now()
	if err := g.Acquire(context.Background(), host, r); err != nil {
		t.Fatalf("second acquire: %v", err)
	}
	elapsed := time.Since(start)
	g.Release(host)

	if elapsed < 40*time.Millisecond {
		t.Errorf("second acquire returned in %v, expected >= ~50ms", elapsed)
	}
	if elapsed > 200*time.Millisecond {
		t.Errorf("second acquire took %v, way longer than expected ~50ms", elapsed)
	}
}

func TestHostGate_RespectsContextCancel(t *testing.T) {
	g := NewHostGate()
	r := robots(1, 0, 0)
	host := "olx.bg"

	if err := g.Acquire(context.Background(), host, r); err != nil {
		t.Fatalf("first acquire: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	err := g.Acquire(ctx, host, r)
	if err == nil {
		t.Fatal("expected ctx.Err(), got nil")
	}
	if !isContextError(err) {
		t.Errorf("got %v, want context error", err)
	}
	g.Release(host)
}

func TestHostGate_ConcurrentSafe(t *testing.T) {
	g := NewHostGate()
	r := robots(1, 0, 0)
	host := "olx.bg"

	const N = 50
	var wg sync.WaitGroup
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			if err := g.Acquire(context.Background(), host, r); err != nil {
				t.Errorf("acquire: %v", err)
				return
			}
			g.Release(host)
		}()
	}
	wg.Wait()
}

func isContextError(err error) bool {
	return err == context.Canceled || err == context.DeadlineExceeded
}
