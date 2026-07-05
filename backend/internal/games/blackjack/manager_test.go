package blackjack

import "testing"

func TestComparePvPHandsHigherTotalWins(t *testing.T) {
	p1, p2 := uint(1), uint(2)

	winner, reason := comparePvPHands(p1, HandInfo{Total: 20}, p2, HandInfo{Total: 18})
	if winner != p1 || reason != "higher_total" {
		t.Fatalf("expected p1 higher_total, got winner=%d reason=%q", winner, reason)
	}
}

func TestComparePvPHandsBustLoses(t *testing.T) {
	p1, p2 := uint(10), uint(20)

	winner, reason := comparePvPHands(p1, HandInfo{Total: 22, Bust: true}, p2, HandInfo{Total: 19})
	if winner != p2 || reason != "opponent_not_bust" {
		t.Fatalf("expected p2 opponent_not_bust, got winner=%d reason=%q", winner, reason)
	}
}

func TestComparePvPHandsBlackjackBeatsRegular21(t *testing.T) {
	p1, p2 := uint(3), uint(4)

	winner, reason := comparePvPHands(
		p1,
		HandInfo{Total: 21, Blackjack: true},
		p2,
		HandInfo{Total: 21},
	)
	if winner != p1 || reason != "blackjack" {
		t.Fatalf("expected blackjack win, got winner=%d reason=%q", winner, reason)
	}
}

func TestComparePvPHandsBothBlackjackPush(t *testing.T) {
	p1, p2 := uint(5), uint(6)

	winner, reason := comparePvPHands(
		p1,
		HandInfo{Total: 21, Blackjack: true},
		p2,
		HandInfo{Total: 21, Blackjack: true},
	)
	if winner != 0 || reason != "both_blackjack" {
		t.Fatalf("expected push, got winner=%d reason=%q", winner, reason)
	}
}

func TestComparePvPHandsEqualTotalsPush(t *testing.T) {
	p1, p2 := uint(7), uint(8)

	winner, reason := comparePvPHands(p1, HandInfo{Total: 19}, p2, HandInfo{Total: 19})
	if winner != 0 || reason != "same_total" {
		t.Fatalf("expected same_total push, got winner=%d reason=%q", winner, reason)
	}
}
