package solo

import (
	"math"
	"math/rand"
)

type ScratchPrize struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	Multiplier float64 `json:"multiplier"`
	Icon       string  `json:"icon"`
}

type ScratchCard struct {
	Index int          `json:"index"`
	Prize ScratchPrize `json:"prize"`
}

type NeonScratchOutcome struct {
	Cards      []ScratchCard `json:"cards"`
	TotalMult  float64       `json:"total_multiplier"`
	TotalWin   float64       `json:"total_win"`
}

var scratchPrizes = []struct {
	id, label, icon string
	multiplier      float64
	weight          int
}{
	{"zero", "MISS", "diamond", 0, 30},
	{"x02", "X0.2", "diamond", 0.2, 18},
	{"x03", "X0.3", "diamond", 0.3, 16},
	{"x05", "X0.5", "diamond", 0.5, 14},
	{"x07", "X0.7", "diamond", 0.7, 12},
	{"x1", "X1", "coin", 1, 10},
	{"x13", "X1.3", "coin", 1.3, 8},
	{"x15", "X1.5", "coin", 1.5, 7},
	{"x2", "X2", "clover", 2, 6},
	{"x3", "X3", "clover", 3, 5},
	{"x5", "X5", "star", 5, 4},
	{"x7", "X7", "star", 7, 3},
	{"x10", "X10", "orb", 10, 2},
	{"x25", "X25", "crown", 25, 1},
}

var scratchWeightTable []int

func init() {
	for i, p := range scratchPrizes {
		for j := 0; j < p.weight; j++ {
			scratchWeightTable = append(scratchWeightTable, i)
		}
	}
}

func pickScratchPrize(rng *rand.Rand) ScratchPrize {
	idx := scratchWeightTable[rng.Intn(len(scratchWeightTable))]
	p := scratchPrizes[idx]
	return ScratchPrize{ID: p.id, Label: p.label, Multiplier: p.multiplier, Icon: p.icon}
}

func SpinNeonScratch(bet float64, rng *rand.Rand) (NeonScratchOutcome, float64) {
	cards := make([]ScratchCard, 0, 3)
	totalMult := 0.0
	for i := 0; i < 3; i++ {
		prize := pickScratchPrize(rng)
		totalMult += prize.Multiplier
		cards = append(cards, ScratchCard{Index: i, Prize: prize})
	}
	payout := roundMoney(bet * totalMult)
	return NeonScratchOutcome{
		Cards:     cards,
		TotalMult: totalMult,
		TotalWin:  payout,
	}, payout
}

func roundMoney(v float64) float64 {
	return math.Round(v*1e9) / 1e9
}
