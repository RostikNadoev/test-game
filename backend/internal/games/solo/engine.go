package solo

import (
	cryptorand "crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math/rand"
)

func SpinInstant(game string, bet float64) (any, float64, error) {
	rng := newRNG()
	switch NormalizeGame(game) {
	case "neon_scratch":
		outcome, payout := SpinNeonScratch(bet, rng)
		return outcome, payout, nil
	case "fruit_cascade":
		outcome, payout := SpinFruitCascade(bet, rng)
		return outcome, payout, nil
	case "royal_vault":
		outcome, payout := SpinRoyalVault(bet, rng)
		return outcome, payout, nil
	default:
		return nil, 0, ErrUnsupportedGame
	}
}

func StartSessionState(game string, rng *rand.Rand) (any, error) {
	switch NormalizeGame(game) {
	case "royal_5x5":
		return NewRoyalState(rng), nil
	case "crystal_mines":
		return StartCrystalMines(rng), nil
	case "turbo_tower":
		return NewTurboState(rng), nil
	default:
		return nil, ErrUnsupportedGame
	}
}

func MarshalSessionState(game string, state any) (string, error) {
	switch NormalizeGame(game) {
	case "royal_5x5":
		s, ok := state.(RoyalState)
		if !ok {
			return "", errors.New("invalid royal state")
		}
		return MarshalRoyalState(s)
	case "crystal_mines":
		s, ok := state.(CrystalState)
		if !ok {
			return "", errors.New("invalid crystal state")
		}
		return MarshalCrystalState(s)
	case "turbo_tower":
		s, ok := state.(TurboState)
		if !ok {
			return "", errors.New("invalid turbo state")
		}
		return MarshalTurboState(s)
	default:
		return "", ErrUnsupportedGame
	}
}

func UnmarshalSessionState(game, raw string) (any, error) {
	switch NormalizeGame(game) {
	case "royal_5x5":
		return UnmarshalRoyalState(raw)
	case "crystal_mines":
		return UnmarshalCrystalState(raw)
	case "turbo_tower":
		return UnmarshalTurboState(raw)
	default:
		return nil, ErrUnsupportedGame
	}
}

type SessionStepResult struct {
	State      any
	Event      any
	Done       bool
	Payout     float64
	Multiplier float64
}

func SessionStep(game string, state any, action string, payload map[string]any, bet float64) (SessionStepResult, error) {
	switch NormalizeGame(game) {
	case "royal_5x5":
		s, ok := state.(RoyalState)
		if !ok {
			return SessionStepResult{}, errors.New("invalid royal state")
		}
		row := intNum(payload["row"])
		col := intNum(payload["col"])
		if action != "pick" {
			return SessionStepResult{}, ErrInvalidAction
		}
		if row != s.CurrentRow || col < 0 || col >= royalCols || s.PickedByRow[row] >= 0 {
			return SessionStepResult{}, ErrInvalidAction
		}
		next, event, done, payout := RoyalStep(s, row, col, bet)
		return SessionStepResult{State: next, Event: event, Done: done, Payout: payout, Multiplier: event.Multiplier}, nil
	case "crystal_mines":
		s, ok := state.(CrystalState)
		if !ok {
			return SessionStepResult{}, errors.New("invalid crystal state")
		}
		cell := intNum(payload["cell_index"])
		if action != "pick" {
			return SessionStepResult{}, ErrInvalidAction
		}
		if cell < 0 || cell >= minesGridSize || containsInt(s.Picked, cell) {
			return SessionStepResult{}, ErrInvalidAction
		}
		next, event, done, payout := CrystalStep(s, cell, bet)
		return SessionStepResult{State: next, Event: event, Done: done, Payout: payout, Multiplier: event.Multiplier}, nil
	case "turbo_tower":
		s, ok := state.(TurboState)
		if !ok {
			return SessionStepResult{}, errors.New("invalid turbo state")
		}
		floor := intNum(payload["floor"])
		door := intNum(payload["door"])
		if action != "pick" {
			return SessionStepResult{}, ErrInvalidAction
		}
		if floor != s.CurrentFloor || door < 0 || door >= towerDoors || s.Picked[floor] >= 0 {
			return SessionStepResult{}, ErrInvalidAction
		}
		next, event, done, payout := TurboStep(s, floor, door, bet)
		return SessionStepResult{State: next, Event: event, Done: done, Payout: payout, Multiplier: event.Multiplier}, nil
	default:
		return SessionStepResult{}, ErrUnsupportedGame
	}
}

func SessionCashout(game string, state any, bet float64) (any, float64, error) {
	switch NormalizeGame(game) {
	case "royal_5x5":
		s := state.(RoyalState)
		next, payout := RoyalCashout(s, bet)
		return next, payout, nil
	case "crystal_mines":
		s := state.(CrystalState)
		next, payout := CrystalCashout(s, bet)
		return next, payout, nil
	case "turbo_tower":
		s := state.(TurboState)
		next, payout := TurboCashout(s, bet)
		return next, payout, nil
	default:
		return nil, 0, ErrUnsupportedGame
	}
}

func intNum(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	default:
		return 0
	}
}

func newRNG() *rand.Rand {
	var seed int64
	_ = binary.Read(cryptorand.Reader, binary.LittleEndian, &seed)
	return rand.New(rand.NewSource(seed))
}

func NewRNG() *rand.Rand {
	return newRNG()
}
