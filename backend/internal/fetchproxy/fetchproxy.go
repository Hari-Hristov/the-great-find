// Package fetchproxy is the Go-side half of the Electron-mediated fetch
// contract used to route olx.bg requests through Electron's Chromium network
// stack instead of Go's net/http.
//
// Why: olx.bg's CDN (CloudFront) blocks any HTTP client whose TLS/HTTP2
// fingerprint isn't a real browser, independent of headers. Electron is
// already resident in the system tray, so the fix routes the two ingestion
// paths (apiclient, scraper) through it via a token-authenticated loopback
// HTTP endpoint that Electron serves and Go calls — see
// frontend/electron/fetchproxy.ts for the other half of the contract.
//
// Client implements politehttp.Doer, so it drops into apiclient.NewClient and
// scraper.NewClient's existing hc parameter with zero changes to either
// package's request-building or response-handling logic.
package fetchproxy

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// envRequest is the wire envelope Go POSTs to Electron's /fetch endpoint.
type envRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

// envResponse is the wire envelope Electron replies with. A successful round
// trip through Electron — even one where the upstream (olx.bg) responded with
// a 403 — comes back as HTTP 200 from Electron with Status set to whatever
// upstream returned. Error is only set when the proxy itself failed (bad
// token, disallowed host, transport failure, timeout) — that case surfaces as
// a Go error from Do, never as a fabricated *http.Response.
type envResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	BodyB64 string            `json:"body_b64"`
	Error   string            `json:"error"`
}

// Client POSTs fetch envelopes to an Electron-hosted loopback proxy and
// rebuilds the upstream response from the JSON envelope it gets back.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// New builds a Client pointed at baseURL (e.g. "http://127.0.0.1:54321")
// authenticating with the given bearer token.
//
// The internal timeout (35s) is deliberately a few seconds above Electron's
// own 30s fetch timeout, so a remote timeout surfaces as a real upstream
// status/error from Electron rather than this client's own context deadline
// firing first.
func New(baseURL, token string) *Client {
	return &Client{
		baseURL: baseURL,
		token:   token,
		http:    &http.Client{Timeout: 35 * time.Second},
	}
}

// FromEnv builds a Client from TGF_FETCH_PROXY / TGF_FETCH_PROXY_TOKEN, the
// env vars the Electron shell injects into the spawned Go sidecar. Returns
// nil when TGF_FETCH_PROXY is unset/empty — that's the normal case for
// `go test ./...`, `make run` in dev, and cmd/dnsprobe, none of which run
// under Electron. Nil is not an error condition; callers (apiclient.NewClient,
// scraper.NewClient) treat a nil Doer as "use the default net/http client".
func FromEnv() *Client {
	base := os.Getenv("TGF_FETCH_PROXY")
	if base == "" {
		return nil
	}
	token := os.Getenv("TGF_FETCH_PROXY_TOKEN")
	return New(base, token)
}

// Do satisfies politehttp.Doer. It marshals req into the envelope, POSTs it
// to the Electron proxy, and rebuilds an *http.Response from the reply.
//
// Two invariants mirrored from the wire-format contract:
//  1. The response body is base64 in the envelope (body_b64) — decoded here.
//  2. Upstream status != proxy status. An olx.bg 403 comes back as a
//     successful (200) call to Electron with envResponse.Status == 403, which
//     this method turns into a non-error *http.Response{StatusCode: 403} —
//     exactly what apiclient/scraper's "unexpected status %d" checks expect.
//     Only a proxy-side failure returns a Go error from Do.
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	headers := make(map[string]string, len(req.Header))
	for k := range req.Header {
		headers[k] = req.Header.Get(k)
	}

	envReq := envRequest{
		URL:     req.URL.String(),
		Method:  req.Method,
		Headers: headers,
	}
	payload, err := json.Marshal(envReq)
	if err != nil {
		return nil, fmt.Errorf("fetchproxy: marshal request envelope: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(req.Context(), http.MethodPost, c.baseURL+"/fetch", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("fetchproxy: build proxy request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("fetchproxy: proxy request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("fetchproxy: read proxy response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetchproxy: proxy returned status %d: %s", resp.StatusCode, string(body))
	}

	var envResp envResponse
	if err := json.Unmarshal(body, &envResp); err != nil {
		return nil, fmt.Errorf("fetchproxy: decode response envelope: %w", err)
	}

	if envResp.Error != "" {
		return nil, fmt.Errorf("fetchproxy: %s", envResp.Error)
	}

	decoded, err := base64.StdEncoding.DecodeString(envResp.BodyB64)
	if err != nil {
		return nil, fmt.Errorf("fetchproxy: decode response body: %w", err)
	}

	header := make(http.Header, len(envResp.Headers))
	for k, v := range envResp.Headers {
		header.Set(k, v)
	}

	return &http.Response{
		StatusCode:    envResp.Status,
		Header:        header,
		Body:          io.NopCloser(bytes.NewReader(decoded)),
		ContentLength: int64(len(decoded)),
		Request:       req,
	}, nil
}
