package solo

import (
	"encoding/json"
	"math/rand"
)

const towerFloors = 8
const towerDoors = 3

var towerMultipliers = []float64{1.2, 1.5, 2, 2.8, 4, 6, 9, 15}

type TurboState struct {
	Traps       []int `json:"traps"`
	CurrentFloor int  `json:"current_floor"`
	ClearedFloors int `json:"cleared_floors"`
	Picked      []int `json:"picked"`
}

type TurboStepEvent struct {
	Floor      int     `json:"floor"`
	Door       int     `json:"door"`
	Safe       bool    `json:"safe"`
	TrapDoor   int     `json:"trap_door,omitempty"`
	Multiplier float64 `json:"multiplier"`
	Status     string  `json:"status"`
	Payout     float64 `json:"payout,omitempty"`
	RevealTraps []int  `json:"reveal_traps,omitempty"`
}

func StartTurboTower(rng *rand.Rand) TurboState {
	traps := make([]int, towerFloors)
	for i := range traps {
		traps[i] = rng.Intn(towerDoors)
	}
	return TurboState{
		Traps:         traps,
		CurrentFloor:  0,
		ClearedFloors: 0,
		Picked:        make([]int, towerFloors),
	}
}

func NewTurboState(rng *rand.Rand) TurboState {
	s := StartTurboTower(rng)
	for i := range s.Picked {
		s.Picked[i] = -1
	}
	return s
}

func towerMultiplier(cleared int) float64 {
	if cleared <= 0 {
		return 1
	}
	idx := cleared - 1
	if idx >= len(towerMultipliers) {
		idx = len(towerMultipliers) - 1
	}
	return towerMultipliers[idx]
}

func TurboStep(state TurboState, floor, door int, bet float64) (TurboState, TurboStepEvent, bool, float64) {
	event := TurboStepEvent{Floor: floor, Door: door}
	if floor != state.CurrentFloor {
		return state, event, false, 0
	}
	if door < 0 || door >= towerDoors {
		return state, event, false, 0
	}
	if state.Picked[floor] >= 0 {
		return state, event, false, 0
	}

	state.Picked[floor] = door
	trap := state.Traps[floor]
	event.TrapDoor = trap

	if door == trap {
		event.Safe = false
		event.Status = "bust"
		event.RevealTraps = state.Traps
		event.Multiplier = towerMultiplier(state.ClearedFloors)
		return state, event, true, 0
	}

	state.ClearedFloors++
	next := floor + 1
	state.CurrentFloor = next
	event.Safe = true
	event.Multiplier = towerMultiplier(state.ClearedFloors)
	event.Status = "playing"

	if next >= towerFloors {
		payout := roundMoney(bet * towerMultipliers[towerFloors-1])
		event.Status = "completed"
		event.Payout = payout
		event.RevealTraps = state.Traps
		return state, event, true, payout
	}

	return state, event, false, 0
}

func TurboCashout(state TurboState, bet float64) (TurboState, float64) {
	if state.ClearedFloors <= 0 {
		return state, 0
	}
	return state, roundMoney(bet * towerMultiplier(state.ClearedFloors))
}

func MarshalTurboState(state TurboState) (string, error) {
	b, err := json.Marshal(state)
	return string(b), err
}

func UnmarshalTurboState(raw string) (TurboState, error) {
	var state TurboState
	err := json.Unmarshal([]byte(raw), &state)
	if err != nil {
		return TurboState{}, err
	}
	if len(state.Picked) == 0 {
		state.Picked = make([]int, towerFloors)
		for i := range state.Picked {
			state.Picked[i] = -1
		}
	}
	return state, err
}
