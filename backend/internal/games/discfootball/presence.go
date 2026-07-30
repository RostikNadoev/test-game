package discfootball

import "time"

func (m *Manager) PauseLobby(lobbyID string) {
	m.mu.Lock()
	s := m.sessions[lobbyID]
	m.mu.Unlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	if !s.closed && !s.settled {
		s.paused = true
		s.zeroVelocitiesLocked()
		s.broadcastLocked(s.publicStateLocked())
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
	if !s.paused || s.closed || s.settled {
		return
	}
	s.paused = false
	shiftDiscTime(&s.planningDeadline, pausedFor)
	shiftDiscTime(&s.revealDeadline, pausedFor)
	shiftDiscTime(&s.resolveStartedAt, pausedFor)
	shiftDiscTime(&s.stableSince, pausedFor)
	shiftDiscTime(&s.goalResumeAt, pausedFor)
	s.broadcastLocked(s.publicStateLocked())
}

func shiftDiscTime(value *time.Time, duration time.Duration) {
	if !value.IsZero() {
		*value = value.Add(duration)
	}
}
