package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"
	"tg-lobbies-base/internal/testdb"

	"github.com/gin-gonic/gin"
)

func TestExchangeTONToGameHandlerDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testdb.Open(t)
	database.SetTestDB(db)
	t.Cleanup(database.ResetTestDB)

	user := testdb.SeedUser(t, db, 1, 100)
	cfg := &config.Config{JWTSecret: "test-secret", JWTTTLHours: 24}
	token, err := services.GenerateJWT(user.ID, cfg)
	if err != nil {
		t.Fatalf("generate jwt: %v", err)
	}

	router := gin.New()
	router.POST("/api/v1/wallet/exchange-ton-to-game", middleware.AuthRequired(cfg), WalletHandler{}.ExchangeTONToGame)

	body, _ := json.Marshal(map[string]any{"coins": 10})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/wallet/exchange-ton-to-game", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503, body=%s", rec.Code, rec.Body.String())
	}
}
