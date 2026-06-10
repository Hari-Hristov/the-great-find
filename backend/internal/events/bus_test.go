package events

import (
	"sync"
	"testing"
	"time"
)

func TestBus_DeliversToSubscribers(t *testing.T) {
	b := NewBus(8)
	defer b.Close()

	ch, unsub := b.Subscribe()
	defer unsub()

	b.Publish(Event{Type: TypeListingNew, Payload: map[string]any{"id": 1}})

	select {
	case e := <-ch:
		if e.Type != TypeListingNew {
			t.Errorf("got type %v, want %v", e.Type, TypeListingNew)
		}
	case <-time.After(time.Second):
		t.Fatal("no event delivered")
	}
}

func TestBus_FanoutToMultipleSubscribers(t *testing.T) {
	b := NewBus(8)
	defer b.Close()

	const N = 5
	chs := make([]<-chan Event, N)
	unsubs := make([]func(), N)
	for i := 0; i < N; i++ {
		chs[i], unsubs[i] = b.Subscribe()
	}
	defer func() {
		for _, u := range unsubs {
			u()
		}
	}()

	b.Publish(Event{Type: TypeAlertFired})

	var wg sync.WaitGroup
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(ch <-chan Event) {
			defer wg.Done()
			select {
			case <-ch:
			case <-time.After(time.Second):
				t.Errorf("subscriber missed event")
			}
		}(chs[i])
	}
	wg.Wait()
}

func TestBus_SlowSubscriberDoesNotBlockPublisher(t *testing.T) {
	b := NewBus(2)
	defer b.Close()

	_, unsub := b.Subscribe() // never reads
	defer unsub()

	// 100 publishes; 2 fit the buffer, 98 are dropped — but Publish must return.
	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			b.Publish(Event{Type: TypeListingNew})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Publish blocked on slow subscriber")
	}
}

func TestBus_UnsubscribeStopsDelivery(t *testing.T) {
	b := NewBus(4)
	defer b.Close()

	ch, unsub := b.Subscribe()
	unsub()

	// channel is closed and drained — receiving must not block.
	select {
	case _, ok := <-ch:
		if ok {
			t.Error("expected closed channel after unsubscribe")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("channel not closed after unsubscribe")
	}
}

func TestBus_CloseDropsAllSubscribers(t *testing.T) {
	b := NewBus(4)
	ch1, _ := b.Subscribe()
	ch2, _ := b.Subscribe()

	b.Close()

	for _, ch := range []<-chan Event{ch1, ch2} {
		select {
		case _, ok := <-ch:
			if ok {
				t.Error("channel should be closed")
			}
		case <-time.After(100 * time.Millisecond):
			t.Error("channel not closed after Bus.Close")
		}
	}
}
