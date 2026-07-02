package hostguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newNextHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

func newReq(t *testing.T, path, host string) *http.Request {
	t.Helper()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, path, nil)
	req.Host = host
	return req
}

func TestMiddleware_AllowsAllowedHost(t *testing.T) {
	h := Middleware(newNextHandler(), 8088)

	cases := []string{
		"127.0.0.1:8088",
		"localhost:8088",
		"LOCALHOST:8088",
		"127.0.0.1:8088",
	}
	for _, host := range cases {
		req := newReq(t, "/api/searches", host)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("host %q: expected 200, got %d", host, rr.Code)
		}
	}
}

func TestMiddleware_RejectsForbiddenHost(t *testing.T) {
	h := Middleware(newNextHandler(), 8088)

	cases := []string{
		"evil.com",
		"evil.com:8088",
		"192.168.1.1:8088",
		"127.0.0.1:9999",          // right ip, wrong port
		"localhost:9999",          // right host, wrong port
		"127.0.0.1.evil.com:8088", // rebinding target
		"",
	}
	for _, host := range cases {
		req := newReq(t, "/api/searches", host)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("host %q: expected 403, got %d", host, rr.Code)
		}
	}
}

func TestMiddleware_HealthzBypass(t *testing.T) {
	// /healthz should pass through with any Host so external probes work.
	h := Middleware(newNextHandler(), 8088)

	req := newReq(t, "/healthz", "evil.com")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("healthz: expected 200 with any host, got %d", rr.Code)
	}
}

func TestMiddleware_PortIsolation(t *testing.T) {
	// A middleware built for port 8088 should NOT accept the same host
	// on a different port — proves the port is part of the check.
	h := Middleware(newNextHandler(), 8088)

	req := newReq(t, "/api/searches", "127.0.0.1:12345")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("wrong port: expected 403, got %d", rr.Code)
	}
}

func TestMiddleware_OSAssignedPort(t *testing.T) {
	// Simulate the packaged-Electron scenario where the port is OS-assigned.
	// The middleware is built once with the resolved port.
	h := Middleware(newNextHandler(), 54321)

	req := newReq(t, "/api/searches", "127.0.0.1:54321")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("OS-assigned port: expected 200, got %d", rr.Code)
	}
}
