package handlers

import (
	"errors"
	"net/http"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type MatchHandler struct {
	Hub *realtime.Hub
}

type finishMatchRequest struct {
	LobbyID      string `json:"lobby_id" binding:"required"`
	Game         string `json:"game" binding:"required"`
	WinnerUserID *uint  `json:"winner_user_id"`
}

func (h MatchHandler) Finish(c *gin.Context) {
	userID := middleware.UserID(c)
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "bad user"})
		return
	}

	var req finishMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	lobby, err := h.Hub.GetLobby(req.LobbyID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if lobby.Status != realtime.LobbyStatusPlaying {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lobby is not playing"})
		return
	}
	if !lobby.Players[userID] {
		c.JSON(http.StatusForbidden, gin.H{"error": "user is not in this lobby"})
		return
	}
	if realtime.NormalizeGameCode(req.Game) != realtime.NormalizeGameCode(lobby.Game) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "game mismatch"})
		return
	}

	if req.WinnerUserID != nil {
		if !lobby.Players[*req.WinnerUserID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "winner is not in lobby"})
			return
		}
	}

	db := database.DB()
	submit, err := services.SubmitMatchFinishVote(db, req.LobbyID, userID, req.WinnerUserID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrMatchNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "match not found"})
		case errors.Is(err, services.ErrInvalidMatchState):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid match state"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit match result"})
		}
		return
	}

	if submit.Pending {
		c.JSON(http.StatusAccepted, gin.H{
			"success": true,
			"pending": true,
			"message": "waiting for opponent confirmation",
		})
		return
	}

	if _, err := h.Hub.FinishLobby(req.LobbyID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finish lobby"})
		return
	}

	user, err := services.GetUserProfile(db, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"balance": gin.H{
			"ton":  user.BalanceTON,
			"game": user.BalanceGame,
		},
		"stats": gin.H{
			"rating":        user.Stats.Rating,
			"wins":          user.Stats.Wins,
			"losses":        user.Stats.Losses,
			"total_games":   user.Stats.TotalGames(),
			"winrate":       user.Stats.WinRate(),
			"favorite_mode": user.Stats.FavoriteMode,
		},
	})
}
