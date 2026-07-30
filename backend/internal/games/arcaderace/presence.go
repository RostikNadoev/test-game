package arcaderace

import "time"

func (m *Manager) PauseLobby(lobbyID string) {
	m.mu.Lock()
	sessions := make([]*Session, 0, 1)
	for _, session := range m.sessions {
		if session.lobbyID == lobbyID {
			sessions = append(sessions, session)
		}
	}
	m.mu.Unlock()

	for _, s := range sessions {
		s.mu.Lock()
		if !s.paused && !s.closed && !s.settled {
			s.paused = true
			if s.phase == PhaseCountdown {
				s.pauseCountdown = remaining(s.countdownEndsAt)
				if s.countdownTimer != nil {
					s.countdownTimer.Stop()
				}
			}
			if s.phase == PhasePlaying {
				s.pauseMatch = remaining(s.matchEndsAt)
				if s.matchTimer != nil {
					s.matchTimer.Stop()
				}
				if s.ballzFinishTimer != nil {
					s.ballzFinishTimer.Stop()
					s.ballzFinishTimer = nil
				}
			}
		}
		s.mu.Unlock()
	}
}

func (m *Manager) ResumeLobby(lobbyID string, pausedFor time.Duration) {
	m.mu.Lock()
	sessions := make([]*Session, 0, 1)
	for _, session := range m.sessions {
		if session.lobbyID == lobbyID {
			sessions = append(sessions, session)
		}
	}
	m.mu.Unlock()

	for _, s := range sessions {
		s.mu.Lock()
		if !s.paused || s.closed || s.settled {
			s.mu.Unlock()
			continue
		}
		s.paused = false
		if !s.matchStartsAt.IsZero() {
			s.matchStartsAt = s.matchStartsAt.Add(pausedFor)
		}
		switch s.phase {
		case PhaseCountdown:
			delay := clampDelay(s.pauseCountdown)
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
			delay := clampDelay(s.pauseMatch)
			s.matchEndsAt = time.Now().Add(delay)
			s.matchTimer = time.AfterFunc(delay, func() {
				s.mu.Lock()
				defer s.mu.Unlock()
				if !s.paused {
					s.finishLocked()
				}
			})
			if s.gameCode == BallzDuelGameCode && s.ballzAllFinishedLocked() {
				s.ballzFinishTimer = time.AfterFunc(300*time.Millisecond, func() {
					s.mu.Lock()
					defer s.mu.Unlock()
					if !s.paused && !s.closed && !s.settled && s.phase == PhasePlaying {
						s.finishLocked()
					}
				})
			}
		}
		s.broadcastLocked(s.publicStateLocked())
		s.mu.Unlock()
	}
}

func remaining(deadline time.Time) time.Duration {
	if deadline.IsZero() {
		return 0
	}
	return time.Until(deadline)
}

func clampDelay(value time.Duration) time.Duration {
	if value < 250*time.Millisecond {
		return 250 * time.Millisecond
	}
	return value
}
