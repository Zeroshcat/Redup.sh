// Package stream implements server-sent events (SSE) fan-out for real-time
// notifications and messages. A single Hub holds an in-memory subscriber
// registry keyed by user id — no Redis, no cross-process fan-out. One node
// handles one user; if you scale horizontally you need a pub/sub layer.
package stream

import (
	"sync"
	"sync/atomic"
)

// Event is the serialized unit delivered to subscribers. Type is an
// opaque string ("notification.new", "message.new", etc.) and Data is the
// already-marshalled JSON payload.
type Event struct {
	Type string
	Data string
}

// subscriberChanBuf is how many events can queue for a given connection
// before we drop them. Slow clients lose events instead of blocking
// publishers.
const subscriberChanBuf = 16

// subscriber wraps a channel with a unique id so Unsubscribe can target it
// without walking every subscriber.
type subscriber struct {
	id int64
	ch chan Event
}

type Hub struct {
	mu     sync.RWMutex
	byUser map[int64][]*subscriber
	// admins is a secondary list for connections that also receive
	// role-scoped broadcasts (PublishToAdmins). A subscriber appears in both
	// byUser and admins when its owner is an admin.
	admins []*subscriber
	nextID atomic.Int64
}

func NewHub() *Hub {
	return &Hub{byUser: map[int64][]*subscriber{}}
}

// Subscribe registers a new channel for the given user and returns it along
// with an unsubscribe function the handler MUST call when the connection
// closes. If isAdmin is true, the same subscriber is also registered to
// receive admin broadcasts via PublishToAdmins.
func (h *Hub) Subscribe(userID int64, isAdmin bool) (<-chan Event, func()) {
	sub := &subscriber{
		id: h.nextID.Add(1),
		ch: make(chan Event, subscriberChanBuf),
	}
	h.mu.Lock()
	h.byUser[userID] = append(h.byUser[userID], sub)
	if isAdmin {
		h.admins = append(h.admins, sub)
	}
	h.mu.Unlock()

	return sub.ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		list := h.byUser[userID]
		for i, s := range list {
			if s.id == sub.id {
				h.byUser[userID] = append(list[:i], list[i+1:]...)
				break
			}
		}
		if len(h.byUser[userID]) == 0 {
			delete(h.byUser, userID)
		}
		if isAdmin {
			for i, s := range h.admins {
				if s.id == sub.id {
					h.admins = append(h.admins[:i], h.admins[i+1:]...)
					break
				}
			}
		}
		close(sub.ch)
	}
}

// Publish fans out an event to every subscriber channel of a given user. A
// non-blocking select means a slow consumer just drops this event rather
// than stalling the publisher.
func (h *Hub) Publish(userID int64, e Event) {
	h.mu.RLock()
	subs := h.byUser[userID]
	// Snapshot so we can release the lock before touching channels.
	copied := make([]*subscriber, len(subs))
	copy(copied, subs)
	h.mu.RUnlock()
	for _, s := range copied {
		select {
		case s.ch <- e:
		default:
			// drop
		}
	}
}

// PublishToAdmins fans out an event to every currently-connected admin
// subscriber. Same non-blocking drop semantics as Publish — a slow admin
// client loses the event rather than stalling the publisher.
func (h *Hub) PublishToAdmins(e Event) {
	h.mu.RLock()
	copied := make([]*subscriber, len(h.admins))
	copy(copied, h.admins)
	h.mu.RUnlock()
	for _, s := range copied {
		select {
		case s.ch <- e:
		default:
			// drop
		}
	}
}

// CountConnected returns the number of open subscriber channels, useful for
// a diag endpoint.
func (h *Hub) CountConnected() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	n := 0
	for _, list := range h.byUser {
		n += len(list)
	}
	return n
}
