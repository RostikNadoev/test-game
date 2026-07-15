package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/handlers"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"
	"tg-lobbies-base/internal/testdb"

	"github.com/gin-gonic/gin"
)

func TestMatchFinishHandlerReturnsPending(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testdb.Open(t)
	database.SetTestDB(db)
	t.Cleanup(database.ResetTestDB)

	user1 := testdb.SeedUser(t, db, 1, 100)
	user2 := testdb.SeedUser(t, db, 2, 100)
	cfg := &config.Config{JWTSecret: "test-secret", JWTTTLHours: 24}

	token1, err := services.GenerateJWT(user1.ID, cfg)
	if err != nil {
		t.Fatalf("generate jwt: %v", err)
	}

	hub := realtime.NewHub(db)
	lobby, err := hub.CreateLobby(user1.ID, "test lobby", "dice_duel", 10)
	if err != nil {
		t.Fatalf("create lobby: %v", err)
	}
	if _, err := hub.JoinLobby(user2.ID, lobby.ID); err != nil {
		t.Fatalf("join lobby: %v", err)
	}

	router := gin.New()
	router.POST("/api/v1/matches/finish", middleware.AuthRequired(cfg), handlers.MatchHandler{Hub: hub}.Finish)

	winner := uint(1)
	body, _ := json.Marshal(map[string]any{
		"lobby_id":       lobby.ID,
		"game":           "dice_duel",
		"winner_user_id": winner,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/matches/finish", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token1)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
}
