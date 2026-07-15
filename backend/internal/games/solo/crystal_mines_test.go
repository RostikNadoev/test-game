package solo

import (
	"testing"
)

func TestCrystalStepSafeAndBust(t *testing.T) {
	rng := NewRNG()
	state := StartCrystalMines(rng)

	safeCell := -1
	for cell := 0; cell < minesGridSize; cell++ {
		if !containsInt(state.Mines, cell) {
			safeCell = cell
			break
		}
	}
	if safeCell < 0 {
		t.Fatal("expected at least one safe cell")
	}

	next, event, done, payout := CrystalStep(state, safeCell, 10)
	if done || payout > 0 {
		t.Fatalf("safe pick should continue session, done=%v payout=%.2f", done, payout)
	}
	if !event.Safe || event.Status != "playing" {
		t.Fatalf("unexpected safe event: %+v", event)
	}

	mineCell := state.Mines[0]
	_, bustEvent, bustDone, bustPayout := CrystalStep(next, mineCell, 10)
	if !bustDone || bustPayout != 0 || bustEvent.Status != "bust" {
		t.Fatalf("expected bust, got done=%v payout=%.2f status=%s", bustDone, bustPayout, bustEvent.Status)
	}
}

func TestCrystalStepInvalidCell(t *testing.T) {
	state := StartCrystalMines(NewRNG())
	_, _, done, _ := CrystalStep(state, -1, 10)
	if done {
		t.Fatal("invalid cell should not finish session")
	}
}
