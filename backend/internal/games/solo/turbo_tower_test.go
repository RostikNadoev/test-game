package solo

import (
	"testing"
)

func TestTurboStepSafePick(t *testing.T) {
	state := NewTurboState(NewRNG())

	trap := state.Traps[0]
	safeDoor := 0
	for door := 0; door < towerDoors; door++ {
		if door != trap {
			safeDoor = door
			break
		}
	}

	next, event, done, payout := TurboStep(state, 0, safeDoor, 10)
	if done || payout > 0 {
		t.Fatalf("first safe pick should continue, done=%v payout=%.2f", done, payout)
	}
	if !event.Safe || next.CurrentFloor != 1 {
		t.Fatalf("unexpected safe step: %+v floor=%d", event, next.CurrentFloor)
	}
}

func TestTurboStepInvalidFloor(t *testing.T) {
	state := NewTurboState(NewRNG())
	_, _, done, _ := TurboStep(state, 1, 0, 10)
	if done {
		t.Fatal("wrong floor should not finish session")
	}
}
