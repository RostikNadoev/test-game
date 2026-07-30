package paperio

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
	shiftPaperTime(&s.startAt, pausedFor)
	shiftPaperTime(&s.deadline, pausedFor)
	offsetMS := pausedFor.Milliseconds()
	for _, player := range s.players {
		if player == nil {
			continue
		}
		if player.RespawnAtMS > 0 {
			player.RespawnAtMS += offsetMS
		}
		shiftPaperTime(&player.LastInputAt, pausedFor)
	}
	s.broadcastStateLocked(true, "resumed")
}

func shiftPaperTime(value *time.Time, duration time.Duration) {
	if !value.IsZero() {
		*value = value.Add(duration)
	}
}
