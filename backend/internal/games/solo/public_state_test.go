package solo

import "testing"

func TestPublicSessionStateOmitsHiddenCrystalMines(t *testing.T) {
	state := CrystalState{
		Mines:     []int{0, 1, 2, 3, 4},
		Picked:    []int{10, 11},
		SafePicks: 2,
	}

	public, err := PublicSessionState("crystal_mines", state)
	if err != nil {
		t.Fatalf("public state: %v", err)
	}

	view, ok := public.(CrystalPublicState)
	if !ok {
		t.Fatalf("unexpected type %T", public)
	}
	if len(view.Picked) != 2 || view.SafePicks != 2 {
		t.Fatalf("unexpected public view: %+v", view)
	}
}

func TestPublicSessionStateTurboTower(t *testing.T) {
	state := NewTurboState(NewRNG())
	state.Picked[0] = 1
	state.ClearedFloors = 1
	state.CurrentFloor = 1

	public, err := PublicSessionState("turbo_tower", state)
	if err != nil {
		t.Fatalf("public state: %v", err)
	}

	view, ok := public.(TurboPublicState)
	if !ok {
		t.Fatalf("unexpected type %T", public)
	}
	if view.CurrentFloor != 1 || view.ClearedFloors != 1 || view.Picked[0] != 1 {
		t.Fatalf("unexpected public view: %+v", view)
	}
}

func TestPublicSessionStateRoyal5x5(t *testing.T) {
	state := NewRoyalState(NewRNG())
	state.PickedByRow[0] = 2
	state.OpenedRows = 1
	state.CurrentRow = 1

	public, err := PublicSessionState("royal_5x5", state)
	if err != nil {
		t.Fatalf("public state: %v", err)
	}

	view, ok := public.(RoyalPublicState)
	if !ok {
		t.Fatalf("unexpected type %T", public)
	}
	if view.CurrentRow != 1 || view.OpenedRows != 1 || view.PickedByRow[0] != 2 {
		t.Fatalf("unexpected public view: %+v", view)
	}
}
