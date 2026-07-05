package solo

import (
	"testing"
)

func TestRoyalStepSafeAndCashout(t *testing.T) {
	state := RoyalState{
		Bombs:       []int{4, 0, 1, 2, 3, 4, 0},
		CurrentRow:  0,
		OpenedRows:  0,
		PickedByRow: []int{-1, -1, -1, -1, -1, -1, -1},
	}
	bet := 10.0

	next, event, done, payout := RoyalStep(state, 0, 0, bet)
	if done || !event.Safe || next.OpenedRows != 1 {
		t.Fatalf("expected safe first pick, got done=%v safe=%v opened=%d", done, event.Safe, next.OpenedRows)
	}
	if payout != 0 {
		t.Fatalf("expected zero interim payout, got %.2f", payout)
	}

	_, cashoutPayout := RoyalCashout(next, bet)
	expected := roundMoney(bet * royalMultipliers[0])
	if cashoutPayout != expected {
		t.Fatalf("cashout = %.2f, want %.2f", cashoutPayout, expected)
	}
}

func TestRoyalStepBust(t *testing.T) {
	state := RoyalState{
		Bombs:       []int{2, 0, 1, 2, 3, 4, 0},
		CurrentRow:  0,
		OpenedRows:  0,
		PickedByRow: []int{-1, -1, -1, -1, -1, -1, -1},
	}

	_, event, done, payout := RoyalStep(state, 0, 2, 10)
	if !done || event.Safe || event.Status != "bust" || payout != 0 {
		t.Fatalf("expected bust, got done=%v status=%s payout=%.2f", done, event.Status, payout)
	}
	if len(event.Bombs) != royalRows {
		t.Fatalf("expected bomb reveal, got %d bombs", len(event.Bombs))
	}
}
