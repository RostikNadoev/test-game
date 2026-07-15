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

func TestAcceptedDropTimeIsLatencyBounded(t *testing.T) {
	s := newSession("lobby", []uint{1, 2}, nil)
	s.latency[1].RTTMS = 200

	const nowMS int64 = 10_000

	if got := s.acceptedDropMSLocked(1, 9_000, nowMS); got != 9_830 {
		t.Fatalf("old claimed time must be clamped to latency window: got %d", got)
	}
	if got := s.acceptedDropMSLocked(1, 10_500, nowMS); got != 10_025 {
		t.Fatalf("future claimed time must be clamped: got %d", got)
	}
	if got := s.acceptedDropMSLocked(1, 9_900, nowMS); got != 9_900 {
		t.Fatalf("valid claimed time should be preserved: got %d", got)
	}
}

func TestDuplicateDropSequenceCannotChangeScoreTwice(t *testing.T) {
	s := newSession("lobby", []uint{1, 2}, nil)
	start := time.UnixMilli(1_000_000)
	s.phase = "playing"
	s.startAt = start
	s.deadline = start.Add(30 * time.Second)
	s.players[1] = initialPlayer(1, start)

	dropAt := start.Add(500 * time.Millisecond)
	message := ClientMessage{
		Type:              "drop",
		Seq:               1,
		EstimatedServerMS: dropAt.UnixMilli(),
	}

	s.dropLocked(1, message, dropAt.Add(50*time.Millisecond))
	firstScore := s.players[1].Score
	firstBlocks := len(s.players[1].Blocks)

	s.dropLocked(1, message, dropAt.Add(150*time.Millisecond))

	if s.players[1].Score != firstScore {
		t.Fatalf("duplicate sequence changed score: before=%d after=%d", firstScore, s.players[1].Score)
	}
	if len(s.players[1].Blocks) != firstBlocks {
		t.Fatalf("duplicate sequence changed tower geometry")
	}
}