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
	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/services"
	"tg-lobbies-base/internal/testdb"

	"github.com/gin-gonic/gin"
)

func setupAdminRouter(t *testing.T, cfg *config.Config) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testdb.Open(t)
	database.SetTestDB(db)
	t.Cleanup(database.ResetTestDB)
	if err := services.ReloadGameSettingsCache(db); err != nil {
		t.Fatalf("reload game settings: %v", err)
	}

	handler := AdminHandler{Cfg: cfg}
	router := gin.New()
	admin := router.Group("/api/v1/admin")
	admin.Use(middleware.AdminCORS(cfg))
	admin.POST("/auth/login", handler.Login)
	protected := admin.Group("")
	protected.Use(middleware.AdminRequired(cfg))
	{
		protected.GET("/auth/me", handler.Me)
		protected.GET("/dashboard", handler.Dashboard)
		protected.GET("/users", handler.ListUsers)
		protected.POST("/users/:id/block", handler.BlockUser)
		protected.POST("/users/:id/wallet/adjust", handler.AdjustWallet)
		protected.GET("/games", handler.ListGames)
		protected.PATCH("/games/:code", handler.PatchGame)
	}
	return router
}

func adminToken(t *testing.T, cfg *config.Config) string {
	t.Helper()
	token, err := services.GenerateAdminJWT(cfg.AdminUsername, cfg)
	if err != nil {
		t.Fatalf("admin token: %v", err)
	}
	return token
}

func TestAdminLoginSuccess(t *testing.T) {
	cfg := &config.Config{
		AdminEnabled:  true,
		AdminUsername: "admin",
		AdminJWTSecret: "admin-secret",
		GinMode:       "debug",
	}
	router := setupAdminRouter(t, cfg)

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "admin"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdminLoginFailure(t *testing.T) {
	cfg := &config.Config{
		AdminEnabled:   true,
		AdminUsername:  "admin",
		AdminPassword:  "secret",
		AdminJWTSecret: "admin-secret",
		GinMode:        "debug",
	}
	router := setupAdminRouter(t, cfg)

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "wrong"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestNonAdminCannotAccessProtectedRoute(t *testing.T) {
	cfg := &config.Config{JWTSecret: "user-secret", JWTTTLHours: 24}
	adminCfg := &config.Config{
		AdminEnabled:   true,
		AdminUsername:  "admin",
		AdminJWTSecret: "admin-secret",
		GinMode:        "debug",
	}
	router := setupAdminRouter(t, adminCfg)

	user := testdb.SeedUser(t, database.DB(), 1, 100)
	userToken, err := services.GenerateJWT(user.ID, cfg)
	if err != nil {
		t.Fatalf("jwt: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestBlockPreventsNormalAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testdb.Open(t)
	database.SetTestDB(db)
	t.Cleanup(database.ResetTestDB)

	user := testdb.SeedUser(t, db, 1, 100)
	user.IsBlocked = true
	if err := db.Save(user).Error; err != nil {
		t.Fatalf("block user: %v", err)
	}

	cfg := &config.Config{JWTSecret: "user-secret", JWTTTLHours: 24}
	token, err := services.GenerateJWT(user.ID, cfg)
	if err != nil {
		t.Fatalf("jwt: %v", err)
	}

	router := gin.New()
	router.GET("/protected", middleware.AuthRequired(cfg), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdminWalletAdjustCreatesTransactionAndAudit(t *testing.T) {
	cfg := &config.Config{
		AdminEnabled:   true,
		AdminUsername:  "admin",
		AdminJWTSecret: "admin-secret",
		GinMode:        "debug",
	}
	router := setupAdminRouter(t, cfg)
	user := testdb.SeedUser(t, database.DB(), 2, 50)

	body, _ := json.Marshal(map[string]any{
		"currency":  "game",
		"operation": "credit",
		"amount":    25,
		"reason":    "compensation",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/2/wallet/adjust", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+adminToken(t, cfg))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	reloaded := testdb.ReloadUser(t, database.DB(), user.ID)
	if reloaded.BalanceGame != 75 {
		t.Fatalf("balance = %v, want 75", reloaded.BalanceGame)
	}

	var txCount int64
	if err := database.DB().Model(&models.WalletTransaction{}).Where("user_id = ? AND type = ?", 2, "admin_adjust").Count(&txCount).Error; err != nil {
		t.Fatalf("count tx: %v", err)
	}
	if txCount != 1 {
		t.Fatalf("tx count = %d, want 1", txCount)
	}
}

func TestDisabledGameCannotStartSoloSession(t *testing.T) {
	db := testdb.Open(t)
	database.SetTestDB(db)
	t.Cleanup(database.ResetTestDB)
	if err := services.ReloadGameSettingsCache(db); err != nil {
		t.Fatalf("reload game settings: %v", err)
	}

	user := testdb.SeedUser(t, db, 3, 100)
	if _, err := services.UpdateGameSetting(db, "neon_scratch", map[string]any{"enabled": false}); err != nil {
		t.Fatalf("disable game: %v", err)
	}

	_, err := services.SoloSpin(db, user.ID, "neon_scratch", 10, "")
	if err == nil {
		t.Fatal("expected error for disabled game")
	}
	if !services.IsGameEnabled("neon_scratch") {
		// expected
	} else {
		t.Fatal("game should be disabled in cache")
	}
}
