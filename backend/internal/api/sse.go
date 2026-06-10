package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Hari-Hristov/the-great-find/backend/internal/events"
)

// NewSSE returns an http.Handler that streams events.Bus events to the client.
//
// Wire format follows the WHATWG SSE spec:
//
//	event: <type>
//	data: <json payload>
//
//	(blank line terminates a frame)
//
// The handler subscribes to the bus, ranges on its channel, writes a frame per
// event, and flushes after each. On client disconnect (r.Context().Done()) it
// unsubscribes and returns. The bus is drop-on-full per subscriber, so a slow
// client cannot stall the scheduler — it simply misses some events and resyncs
// from the DB on the next render.
func NewSSE(bus *events.Bus) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)

		// Tell the client we're alive immediately so EventSource doesn't time out
		// while waiting for the first real event.
		fmt.Fprint(w, ": connected\n\n")
		flusher.Flush()

		ch, unsubscribe := bus.Subscribe()
		defer unsubscribe()

		for {
			select {
			case <-r.Context().Done():
				return
			case e, open := <-ch:
				if !open {
					return
				}
				payload, err := json.Marshal(e.Payload)
				if err != nil {
					payload = []byte("{}")
				}
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.Type, payload)
				flusher.Flush()
			}
		}
	})
}
