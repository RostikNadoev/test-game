package gridlock

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
		s.pauseTurn = time.Until(s.turnEndsAt)
		if s.turnTimer != nil {
			s.turnTimer.Stop()
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
		delay := gridClampDelay(s.pauseCountdown)
		s.countdownEndsAt = time.Now().Add(delay)
		s.countdownTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.paused || s.closed || s.settled || s.phase != PhaseCountdown {
				return
			}
			s.phase = PhasePlaying
			s.countdownEndsAt = time.Time{}
			s.beginTurnLocked(s.playerOrder[0])
			s.broadcastLocked(s.publicStateLocked())
		})
	case PhasePlaying:
		delay := gridClampDelay(s.pauseTurn)
		s.turnEndsAt = time.Now().Add(delay)
		expectedTurn := s.turnNumber
		expectedUser := s.turnUserID
		s.turnTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.paused || s.closed || s.settled || s.phase != PhasePlaying {
				return
			}
			if s.turnNumber != expectedTurn || s.turnUserID != expectedUser {
				return
			}
			s.recordActionLocked("timeout", expectedUser, 0, 0, "")
			s.beginTurnLocked(s.otherPlayerLocked(expectedUser))
			s.broadcastLocked(s.publicStateLocked())
		})
	}
	s.broadcastLocked(s.publicStateLocked())
}

func gridClampDelay(value time.Duration) time.Duration {
	if value < 250*time.Millisecond {
		return 250 * time.Millisecond
	}
	return value
}
