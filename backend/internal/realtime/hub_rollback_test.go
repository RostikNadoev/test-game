package realtime

import (
	"errors"
	"testing"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/testdb"

	"gorm.io/gorm"
)

func TestJoinLobbyCreateMatchFailureRollsBack(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	origCreateMatch := createMatchFn
	t.Cleanup(func() { createMatchFn = origCreateMatch })
	createMatchFn = func(db *gorm.DB, lobbyID, game string, bet float64, playerIDs []uint) (*models.Match, error) {
		return nil, errors.New("forced create match failure")
	}

	hub := NewHub(db)
	lobby, err := hub.CreateLobby(1, "Rollback lobby", "plinko_pvp", 10)
	if err != nil {
		t.Fatalf("create lobby: %v", err)
	}

	_, err = hub.JoinLobby(2, lobby.ID)
	if err == nil {
		t.Fatal("expected create match failure")
	}

	reloaded, err := hub.GetLobby(lobby.ID)
	if err != nil {
		t.Fatalf("get lobby: %v", err)
	}
	if reloaded.Status != LobbyStatusWaiting {
		t.Fatalf("status = %s, want waiting", reloaded.Status)
	}
	if len(reloaded.Players) != 1 {
		t.Fatalf("players = %d, want 1", len(reloaded.Players))
	}
	if _, ok := reloaded.Players[2]; ok {
		t.Fatal("joining player should be removed after rollback")
	}

	user2 := testdb.ReloadUser(t, db, 2)
	if user2.BalanceGame != 100 {
		t.Fatalf("joiner balance = %.2f, want 100 (refunded)", user2.BalanceGame)
	}

	var matchCount int64
	if err := db.Model(&models.Match{}).Where("lobby_id = ?", lobby.ID).Count(&matchCount).Error; err != nil {
		t.Fatalf("count matches: %v", err)
	}
	if matchCount != 0 {
		t.Fatalf("match count = %d, want 0", matchCount)
	}
}

func TestFinishLobbyPersistFailureKeepsMemoryStatus(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)

	origSave := saveLobbyRecordFn
	t.Cleanup(func() { saveLobbyRecordFn = origSave })
	saveLobbyRecordFn = func(db *gorm.DB, lobby *Lobby) error {
		return errors.New("forced save failure")
	}

	hub := NewHub(db)
	lobby, err := hub.CreateLobby(1, "Finish lobby", "grid_lock", 10)
	if err != nil {
		t.Fatalf("create lobby: %v", err)
	}
	if _, err := hub.JoinLobby(2, lobby.ID); err != nil {
		t.Fatalf("join lobby: %v", err)
	}

	_, err = hub.FinishLobby(lobby.ID)
	if err == nil {
		t.Fatal("expected save failure")
	}

	reloaded, err := hub.GetLobby(lobby.ID)
	if err != nil {
		t.Fatalf("get lobby: %v", err)
	}
	if reloaded.Status != LobbyStatusPlaying {
		t.Fatalf("status = %s, want playing", reloaded.Status)
	}
}
