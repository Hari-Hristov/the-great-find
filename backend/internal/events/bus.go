// Package events is a tiny in-process pub/sub bus.
//
// The scheduler publishes Events when listings are created/updated and when
// alerts fire. Subscribers are typically the SSE endpoint (Phase 5) and the
// tray notifier (Phase 7). Subscribers receive events through buffered channels;
// if a subscriber falls behind, events are dropped for THAT subscriber rather
// than blocking the publisher — losing notifications is preferable to wedging
// the scheduler.
package events

import "sync"

type Type string

const (
	TypeListingNew     Type = "listing.new"
	TypeListingUpdated Type = "listing.updated"
	TypeAlertFired     Type = "alert.fired"
	TypePollStarted    Type = "poll.started"
	TypePollFinished   Type = "poll.finished"
	TypePollFailed     Type = "poll.failed"
)

// Event is a structured notification the bus carries.
//
// Payload is a free-form map serialized to JSON for SSE consumers. Keep keys
// stable — UI code reads them by name.
type Event struct {
	Type    Type           `json:"type"`
	Payload map[string]any `json:"payload"`
}

// Bus fans events out to multiple subscribers. The zero value is unusable
// — call NewBus.
type Bus struct {
	mu          sync.RWMutex
	subscribers map[int]chan Event
	nextID      int
	bufSize     int
}

// NewBus returns a Bus where each subscriber gets a channel of the given buffer
// size. 32 is a reasonable default for an app polling at the minute scale.
func NewBus(subscriberBuffer int) *Bus {
	if subscriberBuffer <= 0 {
		subscriberBuffer = 32
	}
	return &Bus{
		subscribers: map[int]chan Event{},
		bufSize:     subscriberBuffer,
	}
}

// Subscribe returns a receive channel and an unsubscribe func. The caller MUST
// call the unsubscribe func when done — the bus does not detect closed
// goroutines on its own.
func (b *Bus) Subscribe() (<-chan Event, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()
	id := b.nextID
	b.nextID++
	ch := make(chan Event, b.bufSize)
	b.subscribers[id] = ch
	return ch, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if c, ok := b.subscribers[id]; ok {
			delete(b.subscribers, id)
			close(c)
		}
	}
}

// Publish broadcasts an event. Slow/full subscribers are skipped, never blocked.
func (b *Bus) Publish(e Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, ch := range b.subscribers {
		select {
		case ch <- e:
		default:
			// Subscriber buffer full → drop. SSE clients that fell behind will
			// catch up on the next event; alerting clients should pull state
			// from the DB rather than depending on every event arriving.
		}
	}
}

// Close drops all subscribers and closes their channels. After Close the bus
// is unusable; this is intended for clean shutdown.
func (b *Bus) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for id, ch := range b.subscribers {
		close(ch)
		delete(b.subscribers, id)
	}
}
