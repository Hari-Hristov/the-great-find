// Package hostguard provides HTTP middleware that rejects requests whose
// Host header is not on a fixed allowlist.
//
// This is the standard defense against DNS rebinding attacks for HTTP servers
// bound to 127.0.0.1. The 127.0.0.1 bind alone is NOT sufficient: a website
// visited by the user in any browser can set a DNS record pointing at
// 127.0.0.1, then make a same-origin request from the attacker's origin —
// the browser sees this as same-origin (bypassing SOP and CORS), but the
// packet still lands on the local server.
//
// The defense: assert that the Host header matches an expected value.
// Browsers set Host automatically from the request URL and cannot be
// overridden from page JavaScript (Host is on the "forbidden header names"
// list per Fetch spec), so a rebinding attacker cannot forge a matching
// Host from a browser.
//
// This is the same pattern used by Docker Desktop, Grafana, Node's
// --inspect, and every other reputable localhost HTTP daemon.
package hostguard

import (
	"fmt"
	"net/http"
	"strings"
)

// Middleware returns an http.Handler that rejects requests whose Host header
// is not one of the allowed values. The allowlist is built from the given
// port and includes 127.0.0.1:<port> and localhost:<port>.
//
// Requests to /healthz are exempt because health probes may come from process
// supervisors that set Host to something else (or nothing meaningful).
// /healthz is read-only and returns fixed content, so it's safe to expose.
func Middleware(next http.Handler, port int) http.Handler {
	allowed := map[string]struct{}{
		fmt.Sprintf("127.0.0.1:%d", port): {},
		fmt.Sprintf("localhost:%d", port): {},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		// r.Host is the effective Host header. HTTP/2 puts the authority
		// in :authority; Go's net/http normalizes that into r.Host too.
		host := strings.ToLower(r.Host)
		if _, ok := allowed[host]; !ok {
			http.Error(w, "forbidden: invalid host header", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
