package airhockey

import (
	"testing"
	"time"
)

func TestClampPaddleTargetKeepsPlayersOnOwnHalf(t *testing.T) {
	players := []uint{10, 20}

	x, y := clampPaddleTarget(players, 10, 2, 0.1)
	if x != BoardWidth-paddleRadius {
		t.Fatalf("expected lower player's x clamp, got %f", x)
	}
	if y != BoardHeight/2+paddleRadius {
		t.Fatalf("expected lower player to stay in lower half, got %f", y)
	}

	x, y = clampPaddleTarget(players, 20, -1, 0.9)
	if x != paddleRadius {
		t.Fatalf("expected upper player's x clamp, got %f", x)
	}
	if y != BoardHeight/2-paddleRadius {
		t.Fatalf("expected upper player to stay in upper half, got %f", y)
	}
}

func TestApplyInputRejectsOldSequence(t *testing.T) {
	s := NewSession("lobby", []uint{1, 2}, nil, nil)
	defer s.Close()

	s.mu.Lock()
	s.phase = PhasePlaying
	s.applyInputLocked(1, ClientMessage{Type: "input", X: 0.7, Y: 1.2, Seq: 2})
	s.applyInputLocked(1, ClientMessage{Type: "input", X: 0.2, Y: 0.7, Seq: 1})
	paddle := *s.paddles[1]
	s.mu.Unlock()

	if paddle.InputSeq != 2 || paddle.TargetX != 0.7 || paddle.TargetY != 1.2 {
		t.Fatalf("old input overwrote latest input: %+v", paddle)
	}
}

func TestThirdGoalFinishesMatch(t *testing.T) {
	winnerCh := make(chan uint, 1)
	s := NewSession("lobby", []uint{1, 2}, func(_ string, winner uint) {
		winnerCh <- winner
	}, nil)
	defer s.Close()

	s.mu.Lock()
	s.phase = PhasePlaying
	s.score[1] = TargetGoals - 1
	s.goalLocked(1, -1)
	phase := s.phase
	winner := s.winnerUserID
	s.mu.Unlock()

	if phase != PhaseMatchOver {
		t.Fatalf("expected match_over, got %q", phase)
	}
	if winner != 1 {
		t.Fatalf("expected player 1 winner, got %d", winner)
	}

	select {
	case callbackWinner := <-winnerCh:
		if callbackWinner != 1 {
			t.Fatalf("expected callback winner 1, got %d", callbackWinner)
		}
	case <-time.After(time.Second):
		t.Fatal("match over callback was not called")
	}
}
