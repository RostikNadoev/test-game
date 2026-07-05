package solo

import (
	"encoding/json"
	"math/rand"
	"sort"
)

const minesGridSize = 25
const minesCount = 5

var minesMultipliers = []float64{1.15, 1.3, 1.5, 1.8, 2.2, 2.8, 3.5, 4.5, 6, 8, 12, 18}

type CrystalState struct {
	Mines        []int `json:"mines"`
	Picked       []int `json:"picked"`
	SafePicks    int   `json:"safe_picks"`
}

type CrystalStepEvent struct {
	CellIndex  int     `json:"cell_index"`
	Safe       bool    `json:"safe"`
	Multiplier float64 `json:"multiplier"`
	Status     string  `json:"status"`
	Payout     float64 `json:"payout,omitempty"`
	RevealMines []int  `json:"reveal_mines,omitempty"`
}

func StartCrystalMines(rng *rand.Rand) CrystalState {
	cells := make([]int, minesGridSize)
	for i := range cells {
		cells[i] = i
	}
	rng.Shuffle(len(cells), func(i, j int) { cells[i], cells[j] = cells[j], cells[i] })
	mines := append([]int(nil), cells[:minesCount]...)
	sort.Ints(mines)
	return CrystalState{Mines: mines, Picked: []int{}, SafePicks: 0}
}

func minesMultiplier(safePicks int) float64 {
	if safePicks <= 0 {
		return 1
	}
	idx := safePicks - 1
	if idx >= len(minesMultipliers) {
		idx = len(minesMultipliers) - 1
	}
	return minesMultipliers[idx]
}

func containsInt(list []int, v int) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

func CrystalStep(state CrystalState, cellIndex int, bet float64) (CrystalState, CrystalStepEvent, bool, float64) {
	event := CrystalStepEvent{CellIndex: cellIndex}
	if cellIndex < 0 || cellIndex >= minesGridSize {
		return state, event, false, 0
	}
	if containsInt(state.Picked, cellIndex) {
		return state, event, false, 0
	}

	state.Picked = append(state.Picked, cellIndex)
	if containsInt(state.Mines, cellIndex) {
		event.Safe = false
		event.Status = "bust"
		event.RevealMines = state.Mines
		event.Multiplier = minesMultiplier(state.SafePicks)
		return state, event, true, 0
	}

	state.SafePicks++
	event.Safe = true
	event.Multiplier = minesMultiplier(state.SafePicks)
	event.Status = "playing"

	maxSafe := minesGridSize - minesCount
	if state.SafePicks >= maxSafe {
		payout := roundMoney(bet * minesMultipliers[len(minesMultipliers)-1])
		event.Status = "completed"
		event.Payout = payout
		event.RevealMines = state.Mines
		return state, event, true, payout
	}

	return state, event, false, 0
}

func CrystalCashout(state CrystalState, bet float64) (CrystalState, float64) {
	if state.SafePicks <= 0 {
		return state, 0
	}
	return state, roundMoney(bet * minesMultiplier(state.SafePicks))
}

func MarshalCrystalState(state CrystalState) (string, error) {
	b, err := json.Marshal(state)
	return string(b), err
}

func UnmarshalCrystalState(raw string) (CrystalState, error) {
	var state CrystalState
	err := json.Unmarshal([]byte(raw), &state)
	return state, err
}
