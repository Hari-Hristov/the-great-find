package fetchproxy

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testToken = "test-token-abc123"

func TestClient_Do_SendsEnvelopeAndBearerHeader(t *testing.T) {
	var gotAuth string
	var gotEnv envRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&gotEnv); err != nil {
			t.Fatalf("decode request envelope: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(envResponse{
			Status:  200,
			Headers: map[string]string{"content-type": "application/json"},
			BodyB64: base64.StdEncoding.EncodeToString([]byte(`{"ok":true}`)),
		})
	}))
	defer srv.Close()

	c := New(srv.URL, testToken)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/api/v1/offers/?x=1", nil)
	req.Header.Set("User-Agent", "the-great-find/1.0 (+personal use; contact: see README)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	if gotAuth != "Bearer "+testToken {
		t.Errorf("Authorization = %q, want Bearer %s", gotAuth, testToken)
	}
	if gotEnv.URL != "https://www.olx.bg/api/v1/offers/?x=1" {
		t.Errorf("envelope URL = %q", gotEnv.URL)
	}
	if gotEnv.Method != http.MethodGet {
		t.Errorf("envelope Method = %q", gotEnv.Method)
	}
}

func TestClient_Do_RequestHeadersRoundTrip(t *testing.T) {
	var gotEnv envRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotEnv)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(envResponse{
			Status:  200,
			BodyB64: base64.StdEncoding.EncodeToString(nil),
		})
	}))
	defer srv.Close()

	c := New(srv.URL, testToken)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/", nil)
	req.Header.Set("User-Agent", "the-great-find/1.0 (+personal use; contact: see README)")
	req.Header.Set("Accept-Language", "bg,en;q=0.9")

	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	if gotEnv.Headers["User-Agent"] != "the-great-find/1.0 (+personal use; contact: see README)" {
		t.Errorf("User-Agent not round-tripped: %+v", gotEnv.Headers)
	}
	if gotEnv.Headers["Accept-Language"] != "bg,en;q=0.9" {
		t.Errorf("Accept-Language not round-tripped: %+v", gotEnv.Headers)
	}
}

func TestClient_Do_UpstreamStatusPassesThroughWithoutError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(envResponse{
			Status:  403,
			Headers: map[string]string{"content-type": "text/html"},
			BodyB64: base64.StdEncoding.EncodeToString([]byte("<html>blocked</html>")),
		})
	}))
	defer srv.Close()

	c := New(srv.URL, testToken)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/", nil)

	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("Do returned error for upstream 403, want a 200-wrapped 403 response: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Errorf("StatusCode = %d, want 403", resp.StatusCode)
	}
}

func TestClient_Do_ProxyErrorStatusBecomesGoError(t *testing.T) {
	for _, code := range []int{401, 500} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(code)
			_, _ = w.Write([]byte("nope"))
		}))

		c := New(srv.URL, testToken)
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/", nil)

		resp, err := c.Do(req)
		if err == nil {
			t.Errorf("proxy status %d: expected Do error, got nil", code)
		}
		if resp != nil {
			resp.Body.Close()
		}
		srv.Close()
	}
}

func TestClient_Do_MalformedJSONBecomesGoError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{not json"))
	}))
	defer srv.Close()

	c := New(srv.URL, testToken)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/", nil)

	resp, err := c.Do(req)
	if err == nil {
		t.Fatal("expected Do error on malformed JSON envelope")
	}
	if resp != nil {
		resp.Body.Close()
	}
}

func TestClient_Do_BadBase64BecomesGoError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(envResponse{
			Status:  200,
			BodyB64: "not-valid-base64!!!",
		})
	}))
	defer srv.Close()

	c := New(srv.URL, testToken)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/", nil)

	resp, err := c.Do(req)
	if err == nil {
		t.Fatal("expected Do error on invalid base64 body")
	}
	if resp != nil {
		resp.Body.Close()
	}
}

func TestClient_Do_EnvelopeErrorFieldBecomesGoError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(envResponse{
			Error: "fetch failed: net::ERR_CONNECTION_RESET",
		})
	}))
	defer srv.Close()

	c := New(srv.URL, testToken)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://www.olx.bg/", nil)

	resp, err := c.Do(req)
	if err == nil {
		t.Fatal("expected Do error when envelope carries an error field")
	}
	if resp != nil {
		resp.Body.Close()
	}
	if !strings.Contains(err.Error(), "ERR_CONNECTION_RESET") {
		t.Errorf("error = %v, want it to mention the envelope error", err)
	}
}

func TestClient_Do_ContextCancellationAborts(t *testing.T) {
	block := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
	}))
	defer func() {
		close(block)
		srv.Close()
	}()

	c := New(srv.URL, testToken)
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.olx.bg/", nil)

	done := make(chan error, 1)
	go func() {
		resp, err := c.Do(req)
		if resp != nil {
			resp.Body.Close()
		}
		done <- err
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected Do error on context cancellation")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Do did not return within 5s of context cancellation")
	}
}
