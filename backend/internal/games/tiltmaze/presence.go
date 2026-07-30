package tiltmaze

import "time"

func (m *Manager) PauseLobby(lobbyID string) {
	m.mu.Lock()
	r := m.rooms[lobbyID]
	m.mu.Unlock()
	if r == nil {
		return
	}
	r.mu.Lock()
	if r.phase != PhaseFinished {
		r.paused = true
	}
	r.mu.Unlock()
}

func (m *Manager) ResumeLobby(lobbyID string, pausedFor time.Duration) {
	m.mu.Lock()
	r := m.rooms[lobbyID]
	m.mu.Unlock()
	if r == nil {
		return
	}
	r.mu.Lock()
	if !r.paused || r.phase == PhaseFinished {
		r.mu.Unlock()
		return
	}
	r.paused = false
	shiftTiltTime(&r.countdownAt, pausedFor)
	shiftTiltTime(&r.matchStart, pausedFor)
	shiftTiltTime(&r.matchEnd, pausedFor)
	for _, player := range r.players {
		if player != nil {
			shiftTiltTime(&player.LastUpdateAt, pausedFor)
		}
	}
	r.mu.Unlock()
	m.broadcast(r)
}

func shiftTiltTime(value *time.Time, duration time.Duration) {
	if !value.IsZero() {
		*value = value.Add(duration)
	}
}
