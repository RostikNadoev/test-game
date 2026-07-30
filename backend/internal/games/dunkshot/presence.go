package dunkshot

import "time"

func (m *Manager) PauseLobby(lobbyID string) {
	m.mu.Lock()
	s := m.sessions[lobbyID]
	m.mu.Unlock()
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.paused || s.closed || s.settled {
		return
	}
	s.paused = true
	if s.phase == PhaseCountdown {
		s.pauseCountdown = time.Until(s.countdownEndsAt)
		if s.countdownTimer != nil {
			s.countdownTimer.Stop()
		}
	}
	if s.phase == PhasePlaying {
		s.pauseMatch = time.Until(s.matchEndsAt)
		if s.matchTimer != nil {
			s.matchTimer.Stop()
		}
	}
}

func (m *Manager) ResumeLobby(lobbyID string, _ time.Duration) {
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

	switch s.phase {
	case PhaseCountdown:
		delay := dunkClampDelay(s.pauseCountdown)
		s.countdownEndsAt = time.Now().Add(delay)
		s.countdownTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.paused || s.closed || s.settled || s.phase != PhaseCountdown {
				return
			}
			if len(s.clients) < 2 {
				s.phase = PhaseWaiting
				s.countdownEndsAt = time.Time{}
				s.broadcastLocked(s.publicStateLocked())
				return
			}
			s.startPlayingLocked()
		})
	case PhasePlaying:
		delay := dunkClampDelay(s.pauseMatch)
		s.matchEndsAt = time.Now().Add(delay)
		s.matchTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if !s.paused {
				s.finishLocked()
			}
		})
	}
	s.broadcastLocked(s.publicStateLocked())
}

func dunkClampDelay(value time.Duration) time.Duration {
	if value < 250*time.Millisecond {
		return 250 * time.Millisecond
	}
	return value
}
