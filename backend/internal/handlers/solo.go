package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type SoloHandler struct{}

func soloResponse(c *gin.Context, balance float64, stats services.SoloStatsDTO, extra gin.H) {
	resp := gin.H{
		"success": true,
		"balance": gin.H{"game": balance},
		"solo_stats": gin.H{
			"total_spins":        stats.TotalSpins,
			"total_wagered":      stats.TotalWagered,
			"total_won":          stats.TotalWon,
			"biggest_win":        stats.BiggestWin,
			"favorite_solo_game": stats.FavoriteSoloGame,
			"last_played_at":     stats.LastPlayedAt,
		},
	}
	for k, v := range extra {
		resp[k] = v
	}
	c.JSON(http.StatusOK, resp)
}

func (SoloHandler) Games(c *gin.Context) {
	games := solo.ListGames()
	c.JSON(http.StatusOK, gin.H{"games": games, "count": len(games)})
}

func (SoloHandler) Stats(c *gin.Context) {
	userID := middleware.UserID(c)
	stats, err := services.GetUserSoloStats(database.DB(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load solo stats"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"solo_stats": stats})
}

func (SoloHandler) History(c *gin.Context) {
	userID := middleware.UserID(c)
	game := c.Query("game")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	rounds, err := services.ListSoloHistory(database.DB(), userID, game, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rounds": rounds, "count": len(rounds)})
}

type soloSpinRequest struct {
	Game           string  `json:"game" binding:"required"`
	BetCoins       float64 `json:"bet_coins" binding:"required"`
	IdempotencyKey string  `json:"idempotency_key"`
}

func (SoloHandler) Spin(c *gin.Context) {
	userID := middleware.UserID(c)
	var req soloSpinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	key := strings.TrimSpace(req.IdempotencyKey)
	if key == "" {
		key = strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	}

	result, err := services.SoloSpin(database.DB(), userID, req.Game, req.BetCoins, key)
	if err != nil {
		writeSoloError(c, err)
		return
	}

	soloResponse(c, result.BalanceGame, result.SoloStats, gin.H{
		"round_id":     result.RoundID,
		"game":         result.Game,
		"bet_coins":    result.BetCoins,
		"payout_coins": result.PayoutCoins,
		"net_coins":    result.NetCoins,
		"outcome":      result.Outcome,
	})
}

type soloSessionStartRequest struct {
	Game     string  `json:"game" binding:"required"`
	BetCoins float64 `json:"bet_coins" binding:"required"`
}

func (SoloHandler) StartSession(c *gin.Context) {
	userID := middleware.UserID(c)
	var req soloSessionStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	result, err := services.StartSoloSession(database.DB(), userID, req.Game, req.BetCoins)
	if err != nil {
		writeSoloError(c, err)
		return
	}

	soloResponse(c, result.BalanceGame, result.SoloStats, gin.H{
		"session_id":   result.SessionID,
		"game":         result.Game,
		"bet_coins":    result.BetCoins,
		"status":       result.Status,
		"multiplier":   result.Multiplier,
		"opened_steps": result.OpenedSteps,
	})
}

type soloStepRequest struct {
	Action  string         `json:"action" binding:"required"`
	Payload map[string]any `json:"payload"`
}

func (SoloHandler) SessionStep(c *gin.Context) {
	userID := middleware.UserID(c)
	sessionID := strings.TrimSpace(c.Param("id"))
	var req soloStepRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	result, err := services.SoloSessionStep(database.DB(), userID, sessionID, req.Action, req.Payload)
	if err != nil {
		writeSoloError(c, err)
		return
	}

	soloResponse(c, result.BalanceGame, result.SoloStats, gin.H{
		"session_id":   result.SessionID,
		"game":         result.Game,
		"bet_coins":    result.BetCoins,
		"status":       result.Status,
		"multiplier":   result.Multiplier,
		"opened_steps": result.OpenedSteps,
		"event":        result.Event,
		"payout_coins": result.PayoutCoins,
	})
}

func (SoloHandler) CashoutSession(c *gin.Context) {
	userID := middleware.UserID(c)
	sessionID := strings.TrimSpace(c.Param("id"))

	result, err := services.CashoutSoloSession(database.DB(), userID, sessionID)
	if err != nil {
		writeSoloError(c, err)
		return
	}

	soloResponse(c, result.BalanceGame, result.SoloStats, gin.H{
		"session_id":   result.SessionID,
		"game":         result.Game,
		"bet_coins":    result.BetCoins,
		"status":       result.Status,
		"multiplier":   result.Multiplier,
		"opened_steps": result.OpenedSteps,
		"payout_coins": result.PayoutCoins,
	})
}

func writeSoloError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrInsufficientBalance):
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "insufficient balance"})
	case errors.Is(err, solo.ErrInvalidBet):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bet amount"})
	case errors.Is(err, solo.ErrUnsupportedGame):
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported solo game"})
	case errors.Is(err, services.ErrSoloActiveSessionExists):
		c.JSON(http.StatusConflict, gin.H{"error": "active solo session already exists"})
	case errors.Is(err, services.ErrSoloSessionNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "solo session not found"})
	case errors.Is(err, services.ErrSoloSessionNotActive):
		c.JSON(http.StatusBadRequest, gin.H{"error": "solo session is not active"})
	case errors.Is(err, solo.ErrInvalidAction):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session action"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
