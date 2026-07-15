package handlers

import (
	"net/http"
	"strconv"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type LeaderboardHandler struct{}

func (LeaderboardHandler) List(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}

	players, err := services.GetLeaderboard(database.DB(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load leaderboard"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"players": players,
		"count":   len(players),
	})
}
