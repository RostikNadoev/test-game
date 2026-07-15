package solo

import "testing"

func TestSessionStepInvalidAction(t *testing.T) {
	state := NewRoyalState(NewRNG())
	_, err := SessionStep("royal_5x5", state, "pick", map[string]any{"row": 1, "col": 0}, 10)
	if err != ErrInvalidAction {
		t.Fatalf("expected ErrInvalidAction, got %v", err)
	}
}

func TestListGamesDeterministic(t *testing.T) {
	first := ListGames()
	second := ListGames()
	if len(first) != len(second) {
		t.Fatalf("catalog size changed between calls")
	}
	for i := range first {
		if first[i].Code != second[i].Code {
			t.Fatalf("catalog order is not deterministic: %s vs %s", first[i].Code, second[i].Code)
		}
	}
}
