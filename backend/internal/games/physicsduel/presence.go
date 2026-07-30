package physicsduel

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
	shiftPhysicsTime(&s.countdownStart, pausedFor)
	shiftPhysicsTime(&s.startAt, pausedFor)
	shiftPhysicsTime(&s.selectDeadline, pausedFor)
	shiftPhysicsTime(&s.revealEnd, pausedFor)
	if s.trajectory != nil && s.trajectory.StartAtMS > 0 {
		s.trajectory.StartAtMS += pausedFor.Milliseconds()
	}
	s.lastBroadcast = time.Time{}
	s.broadcastStateLocked("resumed", false)
}

func shiftPhysicsTime(value *time.Time, duration time.Duration) {
	if !value.IsZero() {
		*value = value.Add(duration)
	}
}
