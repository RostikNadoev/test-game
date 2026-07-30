package presence

import (
	"sync"
	"time"
)

const defaultTTL = 45 * time.Second

type Manager struct {
	mu       sync.Mutex
	seenAt   map[uint]time.Time
	ttl      time.Duration
	now      func() time.Time
}

func NewManager() *Manager {
	return &Manager{
		seenAt: make(map[uint]time.Time),
		ttl:    defaultTTL,
		now:    time.Now,
	}
}

func (m *Manager) Touch(userID uint) int {
	if m == nil || userID == 0 {
		return 0
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()
	m.seenAt[userID] = now
	m.removeExpiredLocked(now)
	return len(m.seenAt)
}

func (m *Manager) Count() int {
	if m == nil {
		return 0
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.removeExpiredLocked(m.now())
	return len(m.seenAt)
}

func (m *Manager) removeExpiredLocked(now time.Time) {
	for userID, lastSeen := range m.seenAt {
		if now.Sub(lastSeen) > m.ttl {
			delete(m.seenAt, userID)
		}
	}
}
