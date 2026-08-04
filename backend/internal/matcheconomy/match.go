package matcheconomy

import "math"

const RakePercent = 0.08

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

// WinnerPayout returns the amount credited to the winner from the full pot.
func WinnerPayout(pot float64) float64 {
	if pot <= 0 {
		return 0
	}
	return roundMoney(pot * (1 - RakePercent))
}

// WinnerProfit returns the winner's net result after their own bet was reserved.
func WinnerProfit(bet float64) float64 {
	if bet <= 0 {
		return 0
	}
	return roundMoney(WinnerPayout(roundMoney(bet*2)) - bet)
}
