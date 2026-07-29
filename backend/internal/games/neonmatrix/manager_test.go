package neonmatrix

import "testing"

func newTestSession(lobbyID string, players []uint) *Session {
	return NewSession(lobbyID, players, 10, nil)
}

func TestSessionStartsWithWaitingThenCountdown(t *testing.T) {
	session := newTestSession("lobby-countdown", []uint{2, 1})

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.phase != PhaseWaiting {
		t.Fatalf("expected waiting phase, got %q", session.phase)
	}

	session.startCountdownLocked()
	if session.phase != PhaseCountdown {
		t.Fatalf("expected countdown phase, got %q", session.phase)
	}
	if session.countdownEnd.IsZero() {
		t.Fatal("countdown deadline must be set")
	}

	session.stopTimersLocked()
}

func TestTargetGeneratedAfterBothPicks(t *testing.T) {
	session := newTestSession("lobby-1", []uint{2, 1})

	session.mu.Lock()
	defer session.mu.Unlock()
	session.startPickingLocked(false)

	if session.target != 0 || session.commitment != "" {
		t.Fatal("target must not exist before picks")
	}

	session.picks[1] = 25
	session.picked[1] = true
	if session.allPickedLocked() {
		t.Fatal("one pick must not complete round")
	}

	session.picks[2] = 75
	session.picked[2] = true
	if err := session.beginSpinLocked(); err != nil {
		t.Fatalf("begin spin failed: %v", err)
	}

	if session.phase != PhaseSpinning {
		t.Fatalf("expected spinning phase, got %q", session.phase)
	}
	if session.target < MinNumber || session.target > MaxNumber {
		t.Fatalf("target out of range: %d", session.target)
	}
	if session.nonce == "" || session.commitment == "" {
		t.Fatal("nonce and commitment must be created after picks")
	}

	session.stopTimersLocked()
}

func TestPickTimeoutAllowsMissingPick(t *testing.T) {
	session := newTestSession("lobby-timeout", []uint{1, 2})

	session.mu.Lock()
	defer session.mu.Unlock()
	session.startPickingLocked(false)
	session.picks[1] = 40
	session.picked[1] = true

	if err := session.beginSpinLocked(); err != nil {
		t.Fatalf("begin spin failed: %v", err)
	}
	if session.phase != PhaseSpinning {
		t.Fatalf("expected spinning phase, got %q", session.phase)
	}
	if session.picked[2] {
		t.Fatal("missing player must remain unpicked")
	}

	session.stopTimersLocked()
}

func TestSpinningStateDoesNotRevealTarget(t *testing.T) {
	session := newTestSession("lobby-secret", []uint{10, 20})

	session.mu.Lock()
	defer session.mu.Unlock()
	session.startPickingLocked(false)
	session.picks[10] = 12
	session.picked[10] = true
	session.picks[20] = 84
	session.picked[20] = true
	if err := session.beginSpinLocked(); err != nil {
		t.Fatalf("begin spin failed: %v", err)
	}

	state := session.publicStateForLocked(10, "state")
	if state.Target != nil {
		t.Fatalf("target leaked during spin: %d", *state.Target)
	}
	if state.RevealNonce != "" {
		t.Fatal("nonce leaked during spin")
	}
	if state.Commitment == "" {
		t.Fatal("commitment must be present during spin")
	}
	if state.Picks[10] == nil || state.Picks[20] == nil {
		t.Fatal("both locked picks should be visible once spin starts")
	}

	session.stopTimersLocked()
}

func TestLandingStateRevealsCommittedTargetBeforeVisualStop(t *testing.T) {
	session := newTestSession("lobby-landing", []uint{10, 20})

	session.mu.Lock()
	defer session.mu.Unlock()
	session.startPickingLocked(false)
	session.picks[10] = 14
	session.picked[10] = true
	session.picks[20] = 76
	session.picked[20] = true
	if err := session.beginSpinLocked(); err != nil {
		t.Fatalf("begin spin failed: %v", err)
	}

	session.beginLandingLocked()
	state := session.publicStateForLocked(10, "state")
	if state.Target == nil || *state.Target != session.target {
		t.Fatal("landing state must contain committed target")
	}
	if state.RevealNonce == "" {
		t.Fatal("landing state must contain reveal nonce")
	}
	if state.StopAtMS <= state.RevealAtMS {
		t.Fatal("stop timestamp must be after reveal timestamp")
	}
	if state.Outcome != nil {
		t.Fatal("outcome must not be published before wheel stop")
	}

	session.stopTimersLocked()
}

func TestPickingStateHidesOpponentPick(t *testing.T) {
	session := newTestSession("lobby-picks", []uint{1, 2})

	session.mu.Lock()
	defer session.mu.Unlock()
	session.startPickingLocked(false)
	session.picks[1] = 33
	session.picked[1] = true

	stateForOne := session.publicStateForLocked(1, "state")
	stateForTwo := session.publicStateForLocked(2, "state")

	if stateForOne.Picks[1] == nil || *stateForOne.Picks[1] != 33 {
		t.Fatal("player must see own locked pick")
	}
	if stateForTwo.Picks[1] != nil {
		t.Fatal("opponent pick leaked before spin")
	}

	session.stopTimersLocked()
}

func TestDamageIsAppliedOnlyAfterFlight(t *testing.T) {
	session := newTestSession("lobby-impact", []uint{1, 2})

	session.mu.Lock()
	defer session.mu.Unlock()
	session.phase = PhaseImpact
	session.outcome = &RoundOutcome{Damage: 18, DefenderUserID: 2}

	if session.health[2] != StartHP {
		t.Fatal("health changed before damage application")
	}

	session.applyDamageLocked()
	if session.health[2] != StartHP-18 {
		t.Fatalf("expected health %d, got %d", StartHP-18, session.health[2])
	}
	if !session.damageApplied {
		t.Fatal("damage_applied must be true")
	}

	session.stopTimersLocked()
}

func TestCalculateOutcomeUsesCircularDistance(t *testing.T) {
	outcome := calculateOutcome(1, 99, true, 2, 50, true, 2)

	if outcome.Player1Distance != 3 {
		t.Fatalf("expected circular distance 3, got %d", outcome.Player1Distance)
	}
	if outcome.Player2Distance != 48 {
		t.Fatalf("expected distance 48, got %d", outcome.Player2Distance)
	}
	if outcome.AttackerUserID != 1 || outcome.DefenderUserID != 2 {
		t.Fatalf("unexpected attacker/defender: %+v", outcome)
	}
	if outcome.Damage != 45 {
		t.Fatalf("expected damage 45, got %d", outcome.Damage)
	}
}

func TestMissingPickLosesToValidPick(t *testing.T) {
	outcome := calculateOutcome(1, 0, false, 2, 52, true, 2)

	if outcome.Player1Distance != NoPickDistance {
		t.Fatalf("expected missing distance %d, got %d", NoPickDistance, outcome.Player1Distance)
	}
	if outcome.AttackerUserID != 2 || outcome.DefenderUserID != 1 {
		t.Fatalf("valid picker must win: %+v", outcome)
	}
	if outcome.Damage <= 0 {
		t.Fatal("missing pick must receive positive damage")
	}
}

func TestBothMissingPicksProduceNoDamage(t *testing.T) {
	outcome := calculateOutcome(1, 0, false, 2, 0, false, 50)
	if !outcome.IsDraw || outcome.Damage != 0 {
		t.Fatalf("both missing must be a no-damage draw: %+v", outcome)
	}
}

func TestCommitmentMatchesReveal(t *testing.T) {
	value := roundCommitment("abc", 4, 71, "nonce")
	if value == "" {
		t.Fatal("commitment is empty")
	}
	if value != roundCommitment("abc", 4, 71, "nonce") {
		t.Fatal("commitment must be deterministic")
	}
	if value == roundCommitment("abc", 4, 72, "nonce") {
		t.Fatal("different target must produce different commitment")
	}
}
