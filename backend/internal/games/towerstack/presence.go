package towerstack

import "time"

func (m *Manager) PauseLobby(lobbyID string) {
	m.mu.Lock()
	s := m.sessions[lobbyID]
	m.mu.Unlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	if !s.finished && !s.closed {
		s.paused = true
	}
	s.mu.Unlock()
}

func (m *Manager) ResumeLobby(lobbyID string, pausedFor time.Duration) {
	m.mu.Lock()
	s := m.sessions[lobbyID]
	m.mu.Unlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.paused || s.finished || s.closed {
		return
	}
	s.paused = false
	if !s.startAt.IsZero() {
		s.startAt = s.startAt.Add(pausedFor)
	}
	if !s.deadline.IsZero() {
		s.deadline = s.deadline.Add(pausedFor)
	}
	offsetMS := pausedFor.Milliseconds()
	for _, player := range s.players {
		if player != nil && player.ActiveStartMS > 0 {
			player.ActiveStartMS += offsetMS
		}
	}
	s.lastBroadcast = time.Time{}
	s.broadcastStateLocked("resumed")
}
