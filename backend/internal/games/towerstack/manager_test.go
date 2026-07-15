package towerstack

import (
	"math"
	"testing"
	"time"
)

func TestActiveXStaysInsideBoard(t *testing.T) {
	start := time.Unix(100, 0)
	player := *initialPlayer(1, start)

	for i := 0; i < 1000; i++ {
		x := activeX(player, start.Add(time.Duration(i)*20*time.Millisecond))
		if x < pad-0.0001 || x > WorldWidth-player.ActiveWidth-pad+0.0001 {
			t.Fatalf("active x outside board: %f", x)
		}
	}
}

func TestActiveXMirrorsSpawnSide(t *testing.T) {
	start := time.Unix(100, 0)
	left := *initialPlayer(1, start)
	right := left
	right.ActiveFromLeft = false

	for _, elapsed := range []time.Duration{0, 200 * time.Millisecond, 900 * time.Millisecond} {
		lx := activeX(left, start.Add(elapsed))
		rx := activeX(right, start.Add(elapsed))
		expected := pad + (WorldWidth - left.ActiveWidth - pad) - lx
		if math.Abs(rx-expected) > 0.0001 {
			t.Fatalf("spawn side is not mirrored: left=%f right=%f expected=%f", lx, rx, expected)
		}
	}
}

func TestScoreForComboIsCapped(t *testing.T) {
	combo := 100
	bonus := minInt(comboBonusMax, comboStep*(combo-comboMin+1))
	if bonus != comboBonusMax {
		t.Fatalf("expected capped combo bonus %d, got %d", comboBonusMax, bonus)
	}
}

func TestOpponentTowerGeometryIsPrivate(t *testing.T) {
	s := newSession("lobby", []uint{1, 2}, nil)
	s.players[1].Blocks = []Block{{Left: 10, Width: 100, Level: 0}}
	s.players[2].Blocks = []Block{{Left: 20, Width: 90, Level: 0}}
	s.players[2].LastResult = &PlaceResult{Seq: 1, Quality: QualityPerfect, Left: 20, Width: 90, ActiveX: 25, ActiveWidth: 90, Level: 1}

	state := s.publicStateForLocked(1, "state")
	if len(state.Players[1].Blocks) != 1 {
		t.Fatalf("own tower should be visible")
	}
	if len(state.Players[2].Blocks) != 0 {
		t.Fatalf("opponent tower should be hidden")
	}
	if state.Players[2].Score != s.players[2].Score {
		t.Fatalf("opponent score should remain visible")
	}
	if state.Players[2].LastResult == nil || state.Players[2].LastResult.Quality != QualityPerfect {
		t.Fatalf("opponent quality should remain visible")
	}
	if state.Players[2].LastResult.Left != 0 || state.Players[2].LastResult.Width != 0 {
		t.Fatalf("opponent placement geometry should be hidden")
	}
}
