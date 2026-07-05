package realtime

import (
	"errors"
	"testing"

	"tg-lobbies-base/internal/services"
	"tg-lobbies-base/internal/testdb"
)

func TestHubCreateJoinLeaveFlow(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 100)
	testdb.SeedUser(t, db, 2, 100)
	testdb.SeedUser(t, db, 3, 1)

	hub := NewHub(db)

	lobby, err := hub.CreateLobby(1, "Test lobby", "plinko_pvp", 10)
	if err != nil {
		t.Fatalf("create lobby: %v", err)
	}
	if lobby.Status != LobbyStatusWaiting {
		t.Fatalf("expected waiting, got %s", lobby.Status)
	}

	user1 := testdb.ReloadUser(t, db, 1)
	if user1.BalanceGame != 90 {
		t.Fatalf("creator balance = %.2f, want 90", user1.BalanceGame)
	}

	_, err = hub.JoinLobby(3, lobby.ID)
	if err == nil || err.Error() != "insufficient balance" {
		t.Fatalf("expected insufficient balance, got %v", err)
	}

	joined, err := hub.JoinLobby(2, lobby.ID)
	if err != nil {
		t.Fatalf("join lobby: %v", err)
	}
	if joined.Status != LobbyStatusPlaying {
		t.Fatalf("expected playing, got %s", joined.Status)
	}
	if len(joined.Players) != 2 {
		t.Fatalf("expected 2 players, got %d", len(joined.Players))
	}

	dto, err := hub.GetLobbyDTO(lobby.ID)
	if err != nil {
		t.Fatalf("get dto: %v", err)
	}
	if len(dto.PlayersInfo) != 2 {
		t.Fatalf("expected players_info, got %d", len(dto.PlayersInfo))
	}

	_, _, err = hub.LeaveLobby(2, lobby.ID)
	if err == nil || err.Error() != "cannot leave lobby while match is in progress" {
		t.Fatalf("expected cannot leave while playing, got %v", err)
	}
}

func TestHubLeaveRefundsBeforeStart(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 50)

	hub := NewHub(db)
	lobby, err := hub.CreateLobby(1, "Refund lobby", "grid_lock", 15)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	_, deleted, err := hub.LeaveLobby(1, lobby.ID)
	if err != nil {
		t.Fatalf("leave: %v", err)
	}
	if !deleted {
		t.Fatalf("expected lobby deleted")
	}

	user := testdb.ReloadUser(t, db, 1)
	if user.BalanceGame != 50 {
		t.Fatalf("balance after leave = %.2f, want 50", user.BalanceGame)
	}
}

func TestHubCreateInsufficientBalance(t *testing.T) {
	db := testdb.Open(t)
	testdb.SeedUser(t, db, 1, 3)

	hub := NewHub(db)
	_, err := hub.CreateLobby(1, "Poor lobby", "air_hockey", 10)
	if err == nil {
		t.Fatal("expected error")
	}
	if !errors.Is(services.ErrInsufficientBalance, mapHubError(err)) {
		// hub wraps as string error
		if err.Error() != "insufficient balance" {
			t.Fatalf("expected insufficient balance, got %v", err)
		}
	}
}

func mapHubError(err error) error {
	if err.Error() == "insufficient balance" {
		return services.ErrInsufficientBalance
	}
	return err
}
