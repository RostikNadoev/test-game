package solo

import (
	"math/rand"
	"testing"
)

func TestSpinFruitCascadeReturnsSteps(t *testing.T) {
	rng := rand.New(rand.NewSource(99))
	bet := 5.0

	outcome, payout := SpinFruitCascade(bet, rng)
	if len(outcome.InitialBoard) != 30 {
		t.Fatalf("expected 30 cells, got %d", len(outcome.InitialBoard))
	}
	if payout < 0 {
		t.Fatalf("negative payout %.2f", payout)
	}
	if outcome.TotalWin != payout {
		t.Fatalf("total_win %.2f != payout %.2f", outcome.TotalWin, payout)
	}

	for i, step := range outcome.Steps {
		if len(step.NextBoard) != 30 {
			t.Fatalf("step %d next_board len = %d", i, len(step.NextBoard))
		}
	}
}
