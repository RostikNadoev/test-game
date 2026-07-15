package paperio

import "testing"

func TestRemapOwnersSwapsPlayers(t *testing.T) {
	got := remapOwners([]uint8{0, 1, 2, 1}, true)
	want := []byte{0, 2, 1, 2}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("index %d: expected %d, got %d", i, want[i], got[i])
		}
	}
}

func TestDirectionCannotReverse(t *testing.T) {
	s := newSession("lobby", []uint{1, 2}, nil)
	s.phase = "playing"
	p := s.players[0]
	p.Dir = 0
	p.NextDir = 0
	s.setDirectionLocked(1, 2, p.LastInputAt.Add(maxInputRate))
	if p.NextDir != 0 {
		t.Fatalf("reverse direction should be rejected, got %d", p.NextDir)
	}
}

func TestCaptureTurnsTrailIntoTerritory(t *testing.T) {
	s := newSession("lobby", []uint{1, 2}, nil)
	p := s.players[0]
	cell := index(20, 20)
	s.setTrailLocked(cell, p.Slot)
	p.TrailCells = []int{cell}
	s.captureLocked(p)
	if s.territory[cell] != p.Slot {
		t.Fatalf("trail cell was not captured")
	}
	if s.trail[cell] != 0 {
		t.Fatalf("trail cell was not cleared")
	}
}
