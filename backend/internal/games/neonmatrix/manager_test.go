package neonmatrix

import "testing"

func TestTargetGeneratedOnlyAfterBothPicks(t *testing.T) {
	session := NewSession("lobby-1", []uint{2, 1}, nil)

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.target != 0 || session.commitment != "" {
		t.Fatal("target must not exist before picks")
	}

	session.picks[1] = 25
	session.picked[1] = true
	if session.allPickedLocked() {
		t.Fatal("one pick must not complete round")
	}
	if session.target != 0 || session.commitment != "" {
		t.Fatal("target must remain hidden and ungenerated after one pick")
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
		t.Fatal("nonce and commitment must be created after both picks")
	}

	session.stopTimersLocked()
}

func TestSpinningStateDoesNotRevealTarget(t *testing.T) {
	session := NewSession("lobby-secret", []uint{10, 20}, nil)

	session.mu.Lock()
	defer session.mu.Unlock()

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
	session := NewSession("lobby-landing", []uint{10, 20}, nil)

	session.mu.Lock()
	defer session.mu.Unlock()

	session.picks[10] = 14
	session.picked[10] = true
	session.picks[20] = 76
	session.picked[20] = true
	if err := session.beginSpinLocked(); err != nil {
		t.Fatalf("begin spin failed: %v", err)
	}

	session.beginLandingLocked()

	if session.phase != PhaseLanding {
		t.Fatalf("expected landing phase, got %q", session.phase)
	}

	state := session.publicStateForLocked(10, "state")
	if state.Target == nil || *state.Target != session.target {
		t.Fatal("landing state must contain the committed target")
	}
	if state.RevealNonce == "" {
		t.Fatal("landing state must contain reveal nonce")
	}
	if state.StopAtMS <= state.RevealAtMS {
		t.Fatal("stop timestamp must be after landing start")
	}
	if state.Outcome != nil {
		t.Fatal("damage outcome must not be published before the wheel stops")
	}

	session.stopTimersLocked()
}

func TestPickingStateHidesOpponentPick(t *testing.T) {
	session := NewSession("lobby-picks", []uint{1, 2}, nil)

	session.mu.Lock()
	defer session.mu.Unlock()

	session.picks[1] = 33
	session.picked[1] = true

	stateForOne := session.publicStateForLocked(1, "state")
	stateForTwo := session.publicStateForLocked(2, "state")

	if stateForOne.Picks[1] == nil || *stateForOne.Picks[1] != 33 {
		t.Fatal("player must see own locked pick")
	}
	if stateForTwo.Picks[1] != nil {
		t.Fatal("opponent pick leaked before both players locked")
	}
}

func TestCalculateOutcomeUsesCircularDistance(t *testing.T) {
	outcome := calculateOutcome(1, 99, 2, 50, 2)

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