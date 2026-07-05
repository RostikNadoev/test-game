package solo

import (
	"math/rand"
	"testing"
)

func TestSpinNeonScratchPayoutMatchesMultiplier(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	bet := 10.0

	outcome, payout := SpinNeonScratch(bet, rng)
	if len(outcome.Cards) != 3 {
		t.Fatalf("expected 3 cards, got %d", len(outcome.Cards))
	}

	sum := 0.0
	for _, card := range outcome.Cards {
		sum += card.Prize.Multiplier
	}
	if sum != outcome.TotalMult {
		t.Fatalf("total mult mismatch: cards=%.2f outcome=%.2f", sum, outcome.TotalMult)
	}

	expected := roundMoney(bet * outcome.TotalMult)
	if payout != expected || outcome.TotalWin != expected {
		t.Fatalf("payout = %.4f total_win = %.4f, want %.4f", payout, outcome.TotalWin, expected)
	}
}

func TestSpinNeonScratchDistributionSmoke(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	bet := 1.0
	totalPayout := 0.0
	spins := 5000

	for i := 0; i < spins; i++ {
		_, payout := SpinNeonScratch(bet, rng)
		totalPayout += payout
	}

	rtp := totalPayout / float64(spins)
	if rtp < 0.5 || rtp > 5.0 {
		t.Fatalf("unexpected RTP %.2f over %d spins", rtp, spins)
	}
}
