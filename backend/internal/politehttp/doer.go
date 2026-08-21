package politehttp

import "net/http"

// Doer is the minimal seam both ingestion paths (apiclient, scraper) call
// through to issue a request. *http.Client satisfies it today; fetchproxy.Client
// satisfies it when requests need to be mediated through Electron's Chromium
// network stack instead of Go's net/http (see backend/internal/fetchproxy).
type Doer interface {
	Do(*http.Request) (*http.Response, error)
}
