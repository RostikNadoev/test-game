package solo

import (
	"math/rand"
	"testing"
)

func TestSpinRoyalVaultReturnsAuthoritativeBoardAndWins(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	outcome, payout := SpinRoyalVault(25, rng)

	if len(outcome.Board) != rvReelCount {
		t.Fatalf("reels = %d, want %d", len(outcome.Board), rvReelCount)
	}
	for reel, column := range outcome.Board {
		if len(column) != rvRowCount {
			t.Fatalf("reel %d rows = %d, want %d", reel, len(column), rvRowCount)
		}
	}

	total := 0.0
	for _, win := range outcome.Wins {
		if win.LineIndex < 0 || win.LineIndex >= rvLineCount {
			t.Fatalf("invalid line index %d", win.LineIndex)
		}
		if win.Count < 3 || win.Count > rvReelCount {
			t.Fatalf("invalid match count %d", win.Count)
		}
		if len(win.Cells) != win.Count {
			t.Fatalf("cells = %d, want %d", len(win.Cells), win.Count)
		}
		total = roundMoney(total + win.Amount)
	}

	if total != payout || outcome.TotalWin != payout {
		t.Fatalf("wins = %.2f total_win = %.2f payout = %.2f", total, outcome.TotalWin, payout)
	}
}

func TestEngineSupportsRoyalVault(t *testing.T) {
	outcome, _, err := SpinInstant("royal_vault", 10)
	if err != nil {
		t.Fatalf("spin royal vault: %v", err)
	}
	if _, ok := outcome.(RoyalVaultOutcome); !ok {
		t.Fatalf("unexpected outcome type %T", outcome)
	}
}
