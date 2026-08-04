package matcheconomy

import "testing"

func TestEightPercentRake(t *testing.T) {
	if got := WinnerPayout(200); got != 184 {
		t.Fatalf("WinnerPayout(200) = %.2f, want 184", got)
	}
	if got := WinnerProfit(100); got != 84 {
		t.Fatalf("WinnerProfit(100) = %.2f, want 84", got)
	}
}
