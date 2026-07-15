package solo

import "errors"

// Public session views omit hidden mines, traps, and bomb positions.

type CrystalPublicState struct {
	Picked    []int `json:"picked"`
	SafePicks int   `json:"safe_picks"`
}

type TurboPublicState struct {
	CurrentFloor  int   `json:"current_floor"`
	ClearedFloors int   `json:"cleared_floors"`
	Picked        []int `json:"picked"`
}

type RoyalPublicState struct {
	CurrentRow  int   `json:"current_row"`
	OpenedRows  int   `json:"opened_rows"`
	PickedByRow []int `json:"picked_by_row"`
}

func PublicSessionState(game string, state any) (any, error) {
	switch NormalizeGame(game) {
	case "crystal_mines":
		s, ok := state.(CrystalState)
		if !ok {
			return nil, errors.New("invalid crystal state")
		}
		picked := append([]int(nil), s.Picked...)
		if picked == nil {
			picked = []int{}
		}
		return CrystalPublicState{Picked: picked, SafePicks: s.SafePicks}, nil
	case "turbo_tower":
		s, ok := state.(TurboState)
		if !ok {
			return nil, errors.New("invalid turbo state")
		}
		picked := append([]int(nil), s.Picked...)
		return TurboPublicState{
			CurrentFloor:  s.CurrentFloor,
			ClearedFloors: s.ClearedFloors,
			Picked:        picked,
		}, nil
	case "royal_5x5":
		s, ok := state.(RoyalState)
		if !ok {
			return nil, errors.New("invalid royal state")
		}
		picked := append([]int(nil), s.PickedByRow...)
		return RoyalPublicState{
			CurrentRow:  s.CurrentRow,
			OpenedRows:  s.OpenedRows,
			PickedByRow: picked,
		}, nil
	default:
		return nil, ErrUnsupportedGame
	}
}

func PublicSessionStateFromJSON(game, raw string) (any, error) {
	state, err := UnmarshalSessionState(game, raw)
	if err != nil {
		return nil, err
	}
	return PublicSessionState(game, state)
}
