package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"
	"tg-lobbies-base/internal/testdb"

	"github.com/gin-gonic/gin"
)

type fakeWithdrawalNotifier struct {
	wakeCount int
}

func (f *fakeWithdrawalNotifier) Ready() bool { return true }
func (f *fakeWithdrawalNotifier) Wake()       { f.wakeCount++ }

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

func TestWithdrawalCreateAndHistoryHandlers(t *testing.T) {
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

	notifier := &fakeWithdrawalNotifier{}
	handler := WalletHandler{WithdrawalNotifier: notifier}
	router := gin.New()
	router.POST("/api/v1/wallet/withdrawals", middleware.AuthRequired(cfg), handler.CreateWithdrawal)
	router.GET("/api/v1/wallet/withdrawals", middleware.AuthRequired(cfg), handler.WithdrawalHistory)

	body, _ := json.Marshal(map[string]any{
		"game_amount":     20,
		"wallet_address":  "EQ" + strings.Repeat("A", 46),
		"idempotency_key": "handler_request_001",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/wallet/withdrawals", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201, body=%s", rec.Code, rec.Body.String())
	}
	if notifier.wakeCount != 1 {
		t.Fatalf("notifier wake count = %d, want 1", notifier.wakeCount)
	}

	historyReq := httptest.NewRequest(http.MethodGet, "/api/v1/wallet/withdrawals", nil)
	historyReq.Header.Set("Authorization", "Bearer "+token)
	historyRec := httptest.NewRecorder()
	router.ServeHTTP(historyRec, historyReq)
	if historyRec.Code != http.StatusOK || !strings.Contains(historyRec.Body.String(), `"status":"pending"`) {
		t.Fatalf("unexpected history response: %d %s", historyRec.Code, historyRec.Body.String())
	}
}
