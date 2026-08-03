package solo

import (
	"fmt"
	"math/rand"
)

const (
	rvReelCount = 5
	rvRowCount  = 3
	rvLineCount = 10
)

type RoyalVaultSymbol string

const (
	rvWild    RoyalVaultSymbol = "wild"
	rvDiamond RoyalVaultSymbol = "diamond"
	rvClover  RoyalVaultSymbol = "clover"
	rvCoin    RoyalVaultSymbol = "coin"
	rvStar    RoyalVaultSymbol = "star"
	rvOrb     RoyalVaultSymbol = "orb"
)

type royalVaultSymbolDef struct {
	weight  int
	payouts [3]float64
}

var royalVaultSymbols = map[RoyalVaultSymbol]royalVaultSymbolDef{
	rvWild:    {weight: 7, payouts: [3]float64{18, 48, 140}},
	rvDiamond: {weight: 9, payouts: [3]float64{24, 64, 190}},
	rvClover:  {weight: 12, payouts: [3]float64{12, 32, 84}},
	rvCoin:    {weight: 14, payouts: [3]float64{9, 22, 58}},
	rvStar:    {weight: 18, payouts: [3]float64{6, 15, 38}},
	rvOrb:     {weight: 22, payouts: [3]float64{4, 10, 26}},
}

var royalVaultSymbolOrder = []RoyalVaultSymbol{
	rvWild,
	rvDiamond,
	rvClover,
	rvCoin,
	rvStar,
	rvOrb,
}

var royalVaultPaylines = [rvLineCount][rvReelCount]int{
	{1, 1, 1, 1, 1},
	{0, 0, 0, 0, 0},
	{2, 2, 2, 2, 2},
	{0, 1, 2, 1, 0},
	{2, 1, 0, 1, 2},
	{0, 0, 1, 2, 2},
	{2, 2, 1, 0, 0},
	{1, 0, 0, 0, 1},
	{1, 2, 2, 2, 1},
	{0, 1, 1, 1, 0},
}

type RoyalVaultWinLine struct {
	LineIndex int              `json:"line_index"`
	Symbol    RoyalVaultSymbol `json:"symbol"`
	Count     int              `json:"count"`
	Amount    float64          `json:"amount"`
	Cells     []string         `json:"cells"`
}

type RoyalVaultOutcome struct {
	Board    [][]RoyalVaultSymbol `json:"board"`
	Wins     []RoyalVaultWinLine  `json:"wins"`
	TotalWin float64              `json:"total_win"`
}

func pickRoyalVaultSymbol(rng *rand.Rand, excludeWild bool) RoyalVaultSymbol {
	totalWeight := 0
	for _, symbol := range royalVaultSymbolOrder {
		if excludeWild && symbol == rvWild {
			continue
		}
		totalWeight += royalVaultSymbols[symbol].weight
	}

	cursor := rng.Intn(totalWeight)
	for _, symbol := range royalVaultSymbolOrder {
		if excludeWild && symbol == rvWild {
			continue
		}
		cursor -= royalVaultSymbols[symbol].weight
		if cursor < 0 {
			return symbol
		}
	}

	return rvOrb
}

func makeRoyalVaultBoard(rng *rand.Rand) [][]RoyalVaultSymbol {
	board := make([][]RoyalVaultSymbol, rvReelCount)
	for reel := 0; reel < rvReelCount; reel++ {
		board[reel] = make([]RoyalVaultSymbol, rvRowCount)
		for row := 0; row < rvRowCount; row++ {
			board[reel][row] = pickRoyalVaultSymbol(rng, false)
		}
	}

	if rng.Float64() >= 0.48 {
		return board
	}

	line := royalVaultPaylines[rng.Intn(len(royalVaultPaylines))]
	symbol := pickRoyalVaultSymbol(rng, true)
	roll := rng.Float64()
	count := 3
	if roll > 0.94 {
		count = 5
	} else if roll > 0.78 {
		count = 4
	}

	for reel := 0; reel < count; reel++ {
		placed := symbol
		if reel > 0 && rng.Float64() < 0.12 {
			placed = rvWild
		}
		board[reel][line[reel]] = placed
	}

	return board
}

func evaluateRoyalVaultBoard(board [][]RoyalVaultSymbol, bet float64) []RoyalVaultWinLine {
	lineBet := bet / rvLineCount
	wins := make([]RoyalVaultWinLine, 0)

	for lineIndex, line := range royalVaultPaylines {
		ids := make([]RoyalVaultSymbol, rvReelCount)
		for reel, row := range line {
			ids[reel] = board[reel][row]
		}

		target := rvWild
		for _, symbol := range ids {
			if symbol != rvWild {
				target = symbol
				break
			}
		}

		count := 0
		for _, symbol := range ids {
			if symbol != target && symbol != rvWild {
				break
			}
			count++
		}
		if count < 3 {
			continue
		}

		cells := make([]string, count)
		for reel := 0; reel < count; reel++ {
			cells[reel] = fmt.Sprintf("%d-%d", reel, line[reel])
		}

		wins = append(wins, RoyalVaultWinLine{
			LineIndex: lineIndex,
			Symbol:    target,
			Count:     count,
			Amount:    roundMoney(royalVaultSymbols[target].payouts[count-3] * lineBet),
			Cells:     cells,
		})
	}

	return wins
}

func SpinRoyalVault(bet float64, rng *rand.Rand) (RoyalVaultOutcome, float64) {
	board := makeRoyalVaultBoard(rng)
	wins := evaluateRoyalVaultBoard(board, bet)
	totalWin := 0.0
	for _, win := range wins {
		totalWin = roundMoney(totalWin + win.Amount)
	}

	return RoyalVaultOutcome{
		Board:    board,
		Wins:     wins,
		TotalWin: totalWin,
	}, totalWin
}
