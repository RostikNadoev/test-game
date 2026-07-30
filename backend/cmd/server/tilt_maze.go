package main

import (
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/games/tiltmaze"
	"tg-lobbies-base/internal/handlers"
	"tg-lobbies-base/internal/realtime"

	"github.com/gin-gonic/gin"
)

func registerTiltMaze(
	router gin.IRoutes,
	cfg *config.Config,
	lobbyStore *realtime.Hub,
	onMatchOver func(lobbyID string, winnerUserID *uint),
) *tiltmaze.Manager {
	manager := tiltmaze.NewManager()
	manager.SetOnMatchOver(onMatchOver)
	go manager.CleanupLoop()

	handler := handlers.TiltMazeWSHandler{
		Cfg:        cfg,
		LobbyStore: lobbyStore,
		Manager:    manager,
	}

	router.GET("/ws/tilt-maze/:lobby_id", handler.Connect)
	return manager
}
