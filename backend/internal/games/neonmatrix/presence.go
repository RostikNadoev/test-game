package neonmatrix

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
	if s.paused || s.matchClosed {
		return
	}
	s.paused = true
	switch s.phase {
	case PhaseCountdown:
		s.pauseRemaining = time.Until(s.countdownEnd)
	case PhasePicking:
		s.pauseRemaining = time.Until(s.pickEnd)
	case PhaseSpinning:
		s.pauseRemaining = time.Until(s.revealAt)
	case PhaseLanding:
		s.pauseRemaining = time.Until(s.stopAt)
	case PhaseImpact:
		if s.damageApplied {
			s.pauseRemaining = time.Until(s.nextRoundAt)
		} else {
			s.pauseRemaining = time.Until(s.damageAt)
		}
	}
	s.stopTimersLocked()
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
	if !s.paused || s.matchClosed {
		return
	}
	s.paused = false
	shiftNeonTime(&s.countdownEnd, pausedFor)
	shiftNeonTime(&s.pickEnd, pausedFor)
	shiftNeonTime(&s.revealAt, pausedFor)
	shiftNeonTime(&s.stopAt, pausedFor)
	shiftNeonTime(&s.damageAt, pausedFor)
	shiftNeonTime(&s.nextRoundAt, pausedFor)
	delay := neonClampDelay(s.pauseRemaining)

	switch s.phase {
	case PhaseCountdown:
		s.countdownTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if !s.paused && s.phase == PhaseCountdown {
				s.startPickingLocked(false)
			}
		})
	case PhasePicking:
		s.pickTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if !s.paused && s.phase == PhasePicking {
				_ = s.beginSpinLocked()
			}
		})
	case PhaseSpinning:
		s.revealTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if !s.paused {
				s.beginLandingLocked()
			}
		})
	case PhaseLanding:
		s.landingTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if !s.paused {
				s.finishLandingLocked()
			}
		})
	case PhaseImpact:
		if s.damageApplied {
			s.resultTimer = time.AfterFunc(delay, func() {
				s.mu.Lock()
				defer s.mu.Unlock()
				if !s.paused {
					s.finishImpactLocked()
				}
			})
		} else {
			s.damageTimer = time.AfterFunc(delay, func() {
				s.mu.Lock()
				defer s.mu.Unlock()
				if !s.paused {
					s.applyDamageLocked()
				}
			})
		}
	}
	s.broadcastLocked("state")
}

func shiftNeonTime(value *time.Time, duration time.Duration) {
	if !value.IsZero() {
		*value = value.Add(duration)
	}
}

func neonClampDelay(value time.Duration) time.Duration {
	if value < 150*time.Millisecond {
		return 150 * time.Millisecond
	}
	return value
}
