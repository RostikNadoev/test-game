package main

import (
	"log"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/handlers"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"

	"tg-lobbies-base/internal/games/blackjack"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	gin.SetMode(cfg.GinMode)

	if err := database.Init(cfg); err != nil {
		log.Fatalf("❌ database init failed: %v", err)
	}

	lobbyStore := realtime.NewHub()
	blackjackManager := blackjack.NewManager()
	blackjackManager.SetOnMatchOver(func(lobbyID string) {
		_, _ = lobbyStore.FinishLobby(lobbyID)
	})
	authHandler := handlers.AuthHandler{Cfg: cfg}
	userHandler := handlers.UserHandler{}
	walletHandler := handlers.WalletHandler{}
	lobbyHandler := handlers.LobbyHandler{Hub: lobbyStore}
	blackjackWSHandler := handlers.BlackjackWSHandler{
		Cfg:        cfg,
		LobbyStore: lobbyStore,
		Manager:    blackjackManager,
	}
	router := gin.Default()
	router.Use(middleware.CORS(cfg))
	router.GET("/ws/blackjack/:lobby_id", blackjackWSHandler.Connect)

	router.GET("/health", func(c *gin.Context) {
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
			auth.POST("/telegram", authHandler.TelegramAuth)
			auth.GET("/me", middleware.AuthRequired(cfg), authHandler.Me)
		}

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

		wallet := api.Group("/wallet")
		wallet.Use(middleware.AuthRequired(cfg))
		{
			wallet.POST("/topup-quote", walletHandler.TopUpQuote)
			wallet.POST("/exchange-ton-to-game", walletHandler.ExchangeTONToGame)
		}

		// Только локально/для теста. В проде выключить ALLOW_DEV_AUTH=false и GIN_MODE=release.
		if cfg.GinMode != "release" && cfg.AllowDevAuth {
			dev := api.Group("/dev")
			dev.Use(middleware.AuthRequired(cfg))
			{
				dev.POST("/add-ton", walletHandler.DevAddTON)
			}
		}
	}

	log.Printf("🚀 backend server started on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("❌ server failed: %v", err)
	}
}
