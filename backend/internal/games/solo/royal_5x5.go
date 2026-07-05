package solo

import (
	"encoding/json"
	"math/rand"
)

const royalRows = 7
const royalCols = 5

var royalMultipliers = []float64{1.1, 1.3, 1.6, 2, 3, 5, 10}

type RoyalState struct {
	Bombs       []int `json:"bombs"`
	CurrentRow  int   `json:"current_row"`
	OpenedRows  int   `json:"opened_rows"`
	PickedByRow []int `json:"picked_by_row"`
}

type RoyalStepEvent struct {
	Row        int     `json:"row"`
	Col        int     `json:"col"`
	Safe       bool    `json:"safe"`
	BombCol    int     `json:"bomb_col,omitempty"`
	Bombs      []int   `json:"bombs,omitempty"`
	CurrentRow int     `json:"current_row"`
	OpenedRows int     `json:"opened_rows"`
	Multiplier float64 `json:"multiplier"`
	Status     string  `json:"status"`
	Payout     float64 `json:"payout,omitempty"`
	RevealAll  bool    `json:"reveal_all,omitempty"`
}

func StartRoyal5x5(rng *rand.Rand) RoyalState {
	bombs := make([]int, royalRows)
	for i := range bombs {
		bombs[i] = rng.Intn(royalCols)
	}
	return RoyalState{
		Bombs:       bombs,
		CurrentRow:  0,
		OpenedRows:  0,
		PickedByRow: make([]int, royalRows),
	}
}

func royalMultiplier(openedRows int) float64 {
	if openedRows <= 0 {
		return 1
	}
	idx := openedRows - 1
	if idx >= len(royalMultipliers) {
		idx = len(royalMultipliers) - 1
	}
	return royalMultipliers[idx]
}

func RoyalStep(state RoyalState, row, col int, bet float64) (RoyalState, RoyalStepEvent, bool, float64) {
	event := RoyalStepEvent{Row: row, Col: col, CurrentRow: state.CurrentRow}
	if row != state.CurrentRow {
		return state, event, false, 0
	}
	if state.PickedByRow[row] >= 0 {
		return state, event, false, 0
	}
	if col < 0 || col >= royalCols {
		return state, event, false, 0
	}

	state.PickedByRow[row] = col
	bombCol := state.Bombs[row]
	event.BombCol = bombCol

	if col == bombCol {
		event.Safe = false
		event.Status = "bust"
		event.RevealAll = true
		event.Bombs = append([]int(nil), state.Bombs...)
		event.Multiplier = royalMultiplier(state.OpenedRows)
		return state, event, true, 0
	}

	state.OpenedRows++
	nextRow := row + 1
	state.CurrentRow = nextRow
	event.Safe = true
	event.OpenedRows = state.OpenedRows
	event.Multiplier = royalMultiplier(state.OpenedRows)
	event.CurrentRow = nextRow

	if nextRow >= royalRows {
		payout := roundMoney(bet * royalMultipliers[royalRows-1])
		event.Status = "completed"
		event.RevealAll = true
		event.Bombs = append([]int(nil), state.Bombs...)
		event.Payout = payout
		return state, event, true, payout
	}

	event.Status = "playing"
	return state, event, false, 0
}

func RoyalCashout(state RoyalState, bet float64) (RoyalState, float64) {
	if state.OpenedRows <= 0 {
		return state, 0
	}
	payout := roundMoney(bet * royalMultiplier(state.OpenedRows))
	return state, payout
}

func MarshalRoyalState(state RoyalState) (string, error) {
	b, err := json.Marshal(state)
	return string(b), err
}

func UnmarshalRoyalState(raw string) (RoyalState, error) {
	var state RoyalState
	err := json.Unmarshal([]byte(raw), &state)
	if err != nil {
		return RoyalState{}, err
	}
	if state.PickedByRow == nil {
		state.PickedByRow = make([]int, royalRows)
		for i := range state.PickedByRow {
			state.PickedByRow[i] = -1
		}
	}
	return state, nil
}

func initRoyalPicks(state *RoyalState) {
	if len(state.PickedByRow) == 0 {
		state.PickedByRow = make([]int, royalRows)
	}
	for i := range state.PickedByRow {
		if state.PickedByRow[i] == 0 && state.OpenedRows == 0 && i == 0 {
			continue
		}
		state.PickedByRow[i] = -1
	}
}

func NewRoyalState(rng *rand.Rand) RoyalState {
	s := StartRoyal5x5(rng)
	s.PickedByRow = make([]int, royalRows)
	for i := range s.PickedByRow {
		s.PickedByRow[i] = -1
	}
	return s
}
