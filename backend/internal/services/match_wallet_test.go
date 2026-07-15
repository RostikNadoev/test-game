package services

import (
	"testing"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"
)

func TestReserveBetRefundAndSettle(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	const lobbyID = "lobby-test-1"
	const bet = 10.0

	if err := ReserveBet(db, 1, lobbyID, bet); err != nil {
		t.Fatalf("reserve player1: %v", err)
	}
	if err := ReserveBet(db, 2, lobbyID, bet); err != nil {
		t.Fatalf("reserve player2: %v", err)
	}

	user1 := testdb.ReloadUser(t, db, 1)
	user2 := testdb.ReloadUser(t, db, 2)
	if user1.BalanceGame != 90 || user2.BalanceGame != 90 {
		t.Fatalf("expected 90 balance after reserve, got %.2f and %.2f", user1.BalanceGame, user2.BalanceGame)
	}

	if _, err := CreateMatch(db, lobbyID, "plinko_pvp", bet, []uint{1, 2}); err != nil {
		t.Fatalf("create match: %v", err)
	}

	winnerID := uint(1)
	match, err := SettleMatch(db, lobbyID, &winnerID)
	if err != nil {
		t.Fatalf("settle match: %v", err)
	}
	if match.Status != models.MatchStatusFinished {
		t.Fatalf("expected finished match, got %s", match.Status)
	}

	user1 = testdb.ReloadUser(t, db, 1)
	user2 = testdb.ReloadUser(t, db, 2)

	expectedPayout := roundMoney(bet * 2 * (1 - matchRakePercent))
	if user1.BalanceGame != roundMoney(90+expectedPayout) {
		t.Fatalf("winner balance = %.2f, want %.2f", user1.BalanceGame, roundMoney(90+expectedPayout))
	}
	if user2.BalanceGame != 90 {
		t.Fatalf("loser balance = %.2f, want 90", user2.BalanceGame)
	}

	if _, err := SettleMatch(db, lobbyID, &winnerID); err != nil {
		t.Fatalf("second settle should be idempotent: %v", err)
	}
}

func TestRefundBet(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 50)

	const lobbyID = "lobby-refund"
	if err := ReserveBet(db, 1, lobbyID, 12); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if err := RefundBet(db, 1, lobbyID); err != nil {
		t.Fatalf("refund: %v", err)
	}

	user := testdb.ReloadUser(t, db, 1)
	if user.BalanceGame != 50 {
		t.Fatalf("balance after refund = %.2f, want 50", user.BalanceGame)
	}
}

func TestReserveBetInsufficientBalance(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 5)

	err := ReserveBet(db, 1, "lobby-low", 10)
	if err != ErrInsufficientBalance {
		t.Fatalf("expected ErrInsufficientBalance, got %v", err)
	}
}

func TestSettleMatchDrawRefundsBoth(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	const lobbyID = "lobby-draw"
	const bet = 8.0

	if err := ReserveBet(db, 1, lobbyID, bet); err != nil {
		t.Fatalf("reserve p1: %v", err)
	}
	if err := ReserveBet(db, 2, lobbyID, bet); err != nil {
		t.Fatalf("reserve p2: %v", err)
	}
	if _, err := CreateMatch(db, lobbyID, "dice_duel", bet, []uint{1, 2}); err != nil {
		t.Fatalf("create match: %v", err)
	}

	if _, err := SettleMatch(db, lobbyID, nil); err != nil {
		t.Fatalf("settle draw: %v", err)
	}

	user1 := testdb.ReloadUser(t, db, 1)
	user2 := testdb.ReloadUser(t, db, 2)
	if user1.BalanceGame != 100 || user2.BalanceGame != 100 {
		t.Fatalf("draw refund failed: %.2f / %.2f", user1.BalanceGame, user2.BalanceGame)
	}
}
