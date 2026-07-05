package main

import (
	"log"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/games/blackjack"
	"tg-lobbies-base/internal/games/pvp"
	"tg-lobbies-base/internal/handlers"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"
	"time"

	"github.com/gin-gonic/gin"
)

func settleLobbyMatch(lobbyStore *realtime.Hub, lobbyID string, winnerUserID *uint) {
	db := database.DB()
	if err := services.SettleMatchFromLobby(db, lobbyID, winnerUserID); err != nil {
		log.Printf("match settlement failed for lobby %s: %v", lobbyID, err)
		return
	}
	if _, err := lobbyStore.FinishLobby(lobbyID); err != nil {
		log.Printf("finish lobby failed for %s: %v", lobbyID, err)
	}
}

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("❌ invalid config: %v", err)
	}
	gin.SetMode(cfg.GinMode)

	if err := database.Init(cfg); err != nil {
		log.Fatalf("❌ database init failed: %v", err)
	}

	db := database.DB()
	lobbyStore := realtime.NewHub(db)

	blackjackManager := blackjack.NewManager()
	go blackjackManager.CleanupLoop()
	blackjackManager.SetOnMatchOver(func(lobbyID string, winnerUserID uint) {
		winner := winnerUserID
		settleLobbyMatch(lobbyStore, lobbyID, &winner)
	})

	pvpManager := pvp.NewManager()
	pvpManager.SetOnMatchOver(func(lobbyID string, winnerUserID *uint) {
		settleLobbyMatch(lobbyStore, lobbyID, winnerUserID)
	})

	authHandler := handlers.AuthHandler{Cfg: cfg}
	userHandler := handlers.UserHandler{}
	walletHandler := handlers.WalletHandler{}
	lobbyHandler := handlers.LobbyHandler{Hub: lobbyStore}
	matchHandler := handlers.MatchHandler{Hub: lobbyStore}
	leaderboardHandler := handlers.LeaderboardHandler{}
	soloHandler := handlers.SoloHandler{}

	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if err := services.ExpireStaleSoloSessions(db, 30*time.Minute); err != nil {
				log.Printf("solo session cleanup failed: %v", err)
			}
		}
	}()

	blackjackWSHandler := handlers.BlackjackWSHandler{
		Cfg:        cfg,
		LobbyStore: lobbyStore,
		Manager:    blackjackManager,
	}

	plinkoWSHandler := handlers.PvpWSHandler{Cfg: cfg, LobbyStore: lobbyStore, Manager: pvpManager, GameCode: "plinko_pvp"}
	paperWSHandler := handlers.PvpWSHandler{Cfg: cfg, LobbyStore: lobbyStore, Manager: pvpManager, GameCode: "paper_io"}
	raceWSHandler := handlers.PvpWSHandler{Cfg: cfg, LobbyStore: lobbyStore, Manager: pvpManager, GameCode: "street_race"}
	towerWSHandler := handlers.PvpWSHandler{Cfg: cfg, LobbyStore: lobbyStore, Manager: pvpManager, GameCode: "tower_stack"}

	router := gin.Default()
	router.Use(middleware.CORS(cfg))

	router.GET("/ws/blackjack/:lobby_id", blackjackWSHandler.Connect)
	router.GET("/ws/plinko/:lobby_id", plinkoWSHandler.Connect)
	router.GET("/ws/paper-io/:lobby_id", paperWSHandler.Connect)
	router.GET("/ws/street-race/:lobby_id", raceWSHandler.Connect)
	router.GET("/ws/tower-stack/:lobby_id", towerWSHandler.Connect)

	router.GET("/health", func(c *gin.Context) {
		if err := database.Ping(); err != nil {
			c.JSON(503, gin.H{
				"status":   "degraded",
				"app":      "tg-lobbies-base",
				"database": "down",
			})
			return
		}

		c.JSON(200, gin.H{
			"status":   "ok",
			"app":      "tg-lobbies-base",
			"database": "postgres",
		})
	})

	api := router.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/telegram", middleware.RateLimit(20, time.Minute), authHandler.TelegramAuth)
			auth.GET("/me", middleware.AuthRequired(cfg), authHandler.Me)
		}

		api.GET("/leaderboard", middleware.AuthRequired(cfg), leaderboardHandler.List)

		users := api.Group("/users")
		users.Use(middleware.AuthRequired(cfg))
		{
			users.GET("/profile", userHandler.Profile)
			users.GET("/balance", userHandler.Balance)
			users.GET("/stats", userHandler.Stats)
		}

		lobbies := api.Group("/lobbies")
		lobbies.Use(middleware.AuthRequired(cfg))
		{
			lobbies.GET("/games", lobbyHandler.Games)
			lobbies.GET("/active", lobbyHandler.Active)
			lobbies.GET("/active/:game", lobbyHandler.ActiveByGame)
			lobbies.POST("/create", lobbyHandler.Create)
			lobbies.GET("/item/:id", lobbyHandler.GetByID)
			lobbies.POST("/join", lobbyHandler.Join)
			lobbies.POST("/leave", lobbyHandler.Leave)
		}

		matches := api.Group("/matches")
		matches.Use(middleware.AuthRequired(cfg))
		{
			matches.POST("/finish", matchHandler.Finish)
		}

		solo := api.Group("/solo")
		solo.Use(middleware.AuthRequired(cfg))
		{
			solo.GET("/games", soloHandler.Games)
			solo.GET("/stats", soloHandler.Stats)
			solo.GET("/history", soloHandler.History)
			solo.GET("/sessions/active", soloHandler.ActiveSession)
			solo.POST("/spin", middleware.RateLimitByUser(30, time.Minute), soloHandler.Spin)
			solo.POST("/sessions", middleware.RateLimitByUser(30, time.Minute), soloHandler.StartSession)
			solo.POST("/sessions/:id/step", middleware.RateLimitByUser(120, time.Minute), soloHandler.SessionStep)
			solo.POST("/sessions/:id/cashout", middleware.RateLimitByUser(60, time.Minute), soloHandler.CashoutSession)
			solo.POST("/sessions/:id/abandon", middleware.RateLimitByUser(30, time.Minute), soloHandler.AbandonSession)
		}

		wallet := api.Group("/wallet")
		wallet.Use(middleware.AuthRequired(cfg))
		{
			wallet.POST("/topup-quote", middleware.RateLimit(60, time.Minute), walletHandler.TopUpQuote)
			wallet.POST("/exchange-ton-to-game", middleware.RateLimit(30, time.Minute), walletHandler.ExchangeTONToGame)
		}

		if cfg.GinMode != "release" && cfg.AllowDevAuth {
			dev := api.Group("/dev")
			dev.Use(middleware.AuthRequired(cfg))
			{
				dev.POST("/grant-game", walletHandler.DevGrantGame)
				dev.POST("/add-ton", walletHandler.DevAddTON)
			}
		}
	}

	if cfg.AdminEnabled {
		adminHandler := handlers.AdminHandler{Cfg: cfg, Hub: lobbyStore}
		adminAPI := router.Group("/api/v1/admin")
		adminAPI.Use(middleware.AdminCORS(cfg))
		{
			adminAPI.POST("/auth/login", adminHandler.Login)
			protected := adminAPI.Group("")
			protected.Use(middleware.AdminRequired(cfg))
			{
				protected.GET("/auth/me", adminHandler.Me)
				protected.GET("/dashboard", adminHandler.Dashboard)
				protected.GET("/users", adminHandler.ListUsers)
				protected.GET("/users/:id", adminHandler.GetUser)
				protected.POST("/users/:id/block", adminHandler.BlockUser)
				protected.POST("/users/:id/unblock", adminHandler.UnblockUser)
				protected.POST("/users/:id/wallet/adjust", adminHandler.AdjustWallet)
				protected.GET("/sessions", adminHandler.ListSessions)
				protected.POST("/sessions/solo/:id/abandon", adminHandler.AbandonSoloSession)
				protected.GET("/games", adminHandler.ListGames)
				protected.PATCH("/games/:code", adminHandler.PatchGame)
				protected.GET("/audit", adminHandler.ListAudit)
			}
		}
	}

	log.Printf("🚀 backend server started on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("❌ server failed: %v", err)
	}
}
