package solo

import (
	"math/rand"
	"sort"
	"strconv"
	"strings"
)

const (
	fcCols        = 6
	fcRows        = 5
	fcCellCount   = fcCols * fcRows
	fcMinCluster  = 5
	fcMaxCascades = 10
)

type FruitSymbol string

const (
	symCherry     FruitSymbol = "cherry"
	symLemon      FruitSymbol = "lemon"
	symOrange     FruitSymbol = "orange"
	symGrape      FruitSymbol = "grape"
	symStrawberry FruitSymbol = "strawberry"
	symWatermelon FruitSymbol = "watermelon"
	symWild       FruitSymbol = "wild"
)

type symbolDef struct {
	pay    float64
	weight int
}

var fruitSymbols = map[FruitSymbol]symbolDef{
	symCherry:     {0.55, 22},
	symLemon:      {0.68, 20},
	symOrange:     {0.82, 18},
	symGrape:      {1.25, 15},
	symStrawberry: {1.65, 13},
	symWatermelon: {2.45, 9},
	symWild:       {6.8, 3},
}

var fruitOrder = []FruitSymbol{symCherry, symLemon, symOrange, symGrape, symStrawberry, symWatermelon, symWild}
var fruitWeightTable []FruitSymbol

func init() {
	for _, sym := range fruitOrder {
		w := fruitSymbols[sym].weight
		for i := 0; i < w; i++ {
			fruitWeightTable = append(fruitWeightTable, sym)
		}
	}
}

type FruitCascadeStep struct {
	Cascade   int           `json:"cascade"`
	Clusters  [][]int       `json:"clusters"`
	Winning   []int         `json:"winning"`
	StepWin   float64       `json:"step_win"`
	Board     []FruitSymbol `json:"board"`
	NextBoard []FruitSymbol `json:"next_board"`
	TotalWin  float64       `json:"total_win"`
}

type FruitCascadeOutcome struct {
	InitialBoard []FruitSymbol      `json:"initial_board"`
	Steps        []FruitCascadeStep `json:"steps"`
	TotalWin     float64            `json:"total_win"`
	BigTier      string             `json:"big_tier,omitempty"`
}

func fcIndex(row, col int) int { return row*fcCols + col }

func randomFruit(rng *rand.Rand) FruitSymbol {
	return fruitWeightTable[rng.Intn(len(fruitWeightTable))]
}

func makeFruitBoard(rng *rand.Rand) []FruitSymbol {
	board := make([]FruitSymbol, fcCellCount)
	for i := range board {
		board[i] = randomFruit(rng)
	}
	return injectStarterCluster(board, rng)
}

func injectStarterCluster(board []FruitSymbol, rng *rand.Rand) []FruitSymbol {
	if rng.Float64() > 0.42 {
		return board
	}
	next := append([]FruitSymbol(nil), board...)
	pool := []FruitSymbol{symCherry, symLemon, symOrange, symGrape, symStrawberry}
	sym := pool[rng.Intn(len(pool))]
	startRow := rng.Intn(fcRows - 1)
	startCol := rng.Intn(fcCols - 2)
	shape := [][2]int{{0, 0}, {0, 1}, {1, 0}, {1, 1}}
	if rng.Float64() > 0.5 {
		shape = append(shape, [2]int{0, 2})
	} else {
		shape = append(shape, [2]int{1, 2})
	}
	for _, d := range shape {
		idx := fcIndex(startRow+d[0], startCol+d[1])
		next[idx] = sym
	}
	return next
}

func findFruitClusters(board []FruitSymbol) [][]int {
	result := [][]int{}
	usedKeys := map[string]bool{}

	for _, target := range fruitOrder {
		if target == symWild {
			continue
		}
		visited := make([]bool, fcCellCount)

		for row := 0; row < fcRows; row++ {
			for col := 0; col < fcCols; col++ {
				start := fcIndex(row, col)
				if visited[start] {
					continue
				}
				if board[start] != target && board[start] != symWild {
					continue
				}

				stack := []int{start}
				group := []int{}
				visited[start] = true

				for len(stack) > 0 {
					cur := stack[len(stack)-1]
					stack = stack[:len(stack)-1]
					group = append(group, cur)
					cr, cc := cur/fcCols, cur%fcCols
					neighbors := [][2]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}
					for _, d := range neighbors {
						nr, nc := cr+d[0], cc+d[1]
						if nr < 0 || nr >= fcRows || nc < 0 || nc >= fcCols {
							continue
						}
						ni := fcIndex(nr, nc)
						if visited[ni] {
							continue
						}
						if board[ni] != target && board[ni] != symWild {
							continue
						}
						visited[ni] = true
						stack = append(stack, ni)
					}
				}

				realCount := 0
				for _, idx := range group {
					if board[idx] == target {
						realCount++
					}
				}
				if len(group) >= fcMinCluster && realCount > 0 {
					sorted := append([]int(nil), group...)
					sort.Ints(sorted)
					key := intsKey(sorted)
					if !usedKeys[key] {
						usedKeys[key] = true
						result = append(result, group)
					}
				}
			}
		}
	}
	return result
}

func intsKey(vals []int) string {
	parts := make([]string, len(vals))
	for i, v := range vals {
		parts[i] = strconv.Itoa(v)
	}
	return strings.Join(parts, "-")
}

func collapseFruitBoard(board []FruitSymbol, winning map[int]bool, rng *rand.Rand) []FruitSymbol {
	next := make([]FruitSymbol, fcCellCount)

	for col := 0; col < fcCols; col++ {
		survivors := []FruitSymbol{}
		for row := fcRows - 1; row >= 0; row-- {
			idx := fcIndex(row, col)
			if !winning[idx] {
				survivors = append(survivors, board[idx])
			}
		}
		writeRow := fcRows - 1
		for _, cell := range survivors {
			next[fcIndex(writeRow, col)] = cell
			writeRow--
		}
		for row := writeRow; row >= 0; row-- {
			next[fcIndex(row, col)] = randomFruit(rng)
		}
	}
	return next
}

func SpinFruitCascade(bet float64, rng *rand.Rand) (FruitCascadeOutcome, float64) {
	current := makeFruitBoard(rng)
	initial := append([]FruitSymbol(nil), current...)
	steps := []FruitCascadeStep{}
	totalWin := 0.0

	for cascade := 1; cascade <= fcMaxCascades; cascade++ {
		clusters := findFruitClusters(current)
		if len(clusters) == 0 {
			break
		}

		winning := map[int]bool{}
		stepWin := 0.0

		for _, group := range clusters {
			baseIdx := group[0]
			for _, idx := range group {
				if current[idx] != symWild {
					baseIdx = idx
					break
				}
			}
			baseSym := current[baseIdx]
			if baseSym == symWild {
				baseSym = symWild
			}
			wildCount := 0
			for _, idx := range group {
				if current[idx] == symWild {
					wildCount++
				}
			}
			sizeBoost := 1.0 + float64(max(0, len(group)-fcMinCluster))*0.42
			wildBoost := 1.0 + float64(wildCount)*0.24
			pay := fruitSymbols[baseSym].pay
			stepWin += pay * float64(len(group)) * sizeBoost * wildBoost * (bet / 10.0) * float64(cascade)
			for _, idx := range group {
				winning[idx] = true
			}
		}

		stepWin = roundMoney(stepWin)
		totalWin = roundMoney(totalWin + stepWin)

		winList := []int{}
		for idx := range winning {
			winList = append(winList, idx)
		}
		sort.Ints(winList)

		clusterCopy := make([][]int, len(clusters))
		for i, c := range clusters {
			clusterCopy[i] = append([]int(nil), c...)
		}

		next := collapseFruitBoard(current, winning, rng)
		steps = append(steps, FruitCascadeStep{
			Cascade:   cascade,
			Clusters:  clusterCopy,
			Winning:   winList,
			StepWin:   stepWin,
			Board:     append([]FruitSymbol(nil), current...),
			NextBoard: append([]FruitSymbol(nil), next...),
			TotalWin:  totalWin,
		})

		current = next
	}

	outcome := FruitCascadeOutcome{
		InitialBoard: initial,
		Steps:        steps,
		TotalWin:     totalWin,
	}
	if totalWin > 0 {
		ratio := totalWin / bet
		switch {
		case ratio >= 14:
			outcome.BigTier = "epic"
		case ratio >= 7:
			outcome.BigTier = "mega"
		case ratio >= 3:
			outcome.BigTier = "big"
		}
	}
	return outcome, totalWin
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
