package services

import (
	"testing"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"
)

func TestSubmitMatchFinishVoteRequiresBothPlayers(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	const lobbyID = "lobby-vote-1"
	const bet = 10.0

	if err := ReserveBet(db, 1, lobbyID, bet); err != nil {
		t.Fatalf("reserve p1: %v", err)
	}
	if err := ReserveBet(db, 2, lobbyID, bet); err != nil {
		t.Fatalf("reserve p2: %v", err)
	}
	if _, err := CreateMatch(db, lobbyID, "dice_duel", bet, []uint{1, 2}); err != nil {
		t.Fatalf("create match: %v", err)
	}

	winner := uint(1)
	first, err := SubmitMatchFinishVote(db, lobbyID, 1, &winner)
	if err != nil {
		t.Fatalf("first vote: %v", err)
	}
	if !first.Pending || first.Settled {
		t.Fatalf("expected pending first vote, got %+v", first)
	}

	second, err := SubmitMatchFinishVote(db, lobbyID, 2, &winner)
	if err != nil {
		t.Fatalf("second vote: %v", err)
	}
	if !second.Settled {
		t.Fatalf("expected settled match after agreeing votes, got %+v", second)
	}

	user1 := testdb.ReloadUser(t, db, 1)
	user2 := testdb.ReloadUser(t, db, 2)
	const expectedPayout = 18.4 // 20 GAME pot minus the 8% platform rake.
	if user1.BalanceGame != roundMoney(90+expectedPayout) {
		t.Fatalf("winner balance = %.2f, want %.2f", user1.BalanceGame, roundMoney(90+expectedPayout))
	}
	if user2.BalanceGame != 90 {
		t.Fatalf("loser balance = %.2f, want 90", user2.BalanceGame)
	}

	var match models.Match
	if err := db.Where("lobby_id = ?", lobbyID).First(&match).Error; err != nil {
		t.Fatalf("reload match: %v", err)
	}
	if match.Status != models.MatchStatusFinished {
		t.Fatalf("match status = %s, want finished", match.Status)
	}
}

func TestSubmitMatchFinishVoteConflictSettlesDraw(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	const lobbyID = "lobby-vote-draw"
	const bet = 8.0

	if err := ReserveBet(db, 1, lobbyID, bet); err != nil {
		t.Fatalf("reserve p1: %v", err)
	}
	if err := ReserveBet(db, 2, lobbyID, bet); err != nil {
		t.Fatalf("reserve p2: %v", err)
	}
	if _, err := CreateMatch(db, lobbyID, "grid_lock", bet, []uint{1, 2}); err != nil {
		t.Fatalf("create match: %v", err)
	}

	winner1 := uint(1)
	winner2 := uint(2)
	if _, err := SubmitMatchFinishVote(db, lobbyID, 1, &winner1); err != nil {
		t.Fatalf("vote p1: %v", err)
	}
	if _, err := SubmitMatchFinishVote(db, lobbyID, 2, &winner2); err != nil {
		t.Fatalf("vote p2: %v", err)
	}

	user1 := testdb.ReloadUser(t, db, 1)
	user2 := testdb.ReloadUser(t, db, 2)
	if user1.BalanceGame != 100 || user2.BalanceGame != 100 {
		t.Fatalf("conflict should refund both players, got %.2f / %.2f", user1.BalanceGame, user2.BalanceGame)
	}
}
