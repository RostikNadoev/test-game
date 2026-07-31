package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type WithdrawalNotifier interface {
	Ready() bool
	Wake()
}

type WalletHandler struct {
	WithdrawalNotifier WithdrawalNotifier
}

func (h WalletHandler) CreateWithdrawal(c *gin.Context) {
	if h.WithdrawalNotifier == nil || !h.WithdrawalNotifier.Ready() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "withdrawals are temporarily unavailable"})
		return
	}

	var req struct {
		GameAmount     int64  `json:"game_amount" binding:"required"`
		WalletAddress  string `json:"wallet_address" binding:"required"`
		IdempotencyKey string `json:"idempotency_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "game_amount must be a positive whole number"})
		return
	}

	result, err := services.CreateWithdrawal(
		database.DB(),
		middleware.UserID(c),
		req.GameAmount,
		req.WalletAddress,
		req.IdempotencyKey,
	)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidWithdrawalAmount):
			c.JSON(http.StatusBadRequest, gin.H{"error": "game_amount must be a positive whole number"})
		case errors.Is(err, services.ErrInvalidWalletAddress):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid TON wallet address"})
		case errors.Is(err, services.ErrInvalidIdempotencyKey):
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid idempotency key"})
		case errors.Is(err, services.ErrInsufficientBalance):
			c.JSON(http.StatusConflict, gin.H{"error": "insufficient balance"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create withdrawal"})
		}
		return
	}

	h.WithdrawalNotifier.Wake()
	statusCode := http.StatusCreated
	if result.Existing {
		statusCode = http.StatusOK
	}
	c.JSON(statusCode, gin.H{
		"withdrawal": withdrawalDTO(result.Details.Request),
		"balance": gin.H{"game": result.BalanceGame},
	})
}

func (WalletHandler) WithdrawalHistory(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	rows, err := services.ListWithdrawals(database.DB(), middleware.UserID(c), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load withdrawal history"})
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, withdrawalDTO(row))
	}
	c.JSON(http.StatusOK, gin.H{"withdrawals": items, "count": len(items)})
}

func withdrawalDTO(request models.WithdrawalRequest) gin.H {
	return gin.H{
		"id":             request.ID,
		"type":           "withdrawal",
		"status":         request.Status,
		"game_amount":    request.GameAmount,
		"ton_amount":     services.FormatTONNano(request.TonNanoAmount),
		"wallet_address": request.WalletAddress,
		"created_at":     request.CreatedAt,
		"completed_at":   request.CompletedAt,
	}
}

// TopUpQuote — просто расчет для окна пополнения.
// Баланс не меняет.
//
// Например:
// coins = 5
// required_ton = 0.5
func (WalletHandler) TopUpQuote(c *gin.Context) {
	var req struct {
		Coins int64 `json:"coins" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.Coins < services.MinTopUpCoins {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":     "coins amount must be >= 1",
			"min_coins": services.MinTopUpCoins,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"coins":        req.Coins,
		"required_ton": services.CoinsToTON(req.Coins),
		"rate":         "1 GAME = 0.1 TON",
	})
}

// ExchangeTONToGame оставляем на старом URL,
// чтобы фронту меньше ломать интеграцию.
//
// Но теперь request принимает coins, а не amount TON.
// TON не хранится как игровая валюта, он только считается как стоимость пополнения.
func (WalletHandler) ExchangeTONToGame(c *gin.Context) {
	var req struct {
		Coins int64 `json:"coins" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	user, requiredTON, err := services.ExchangeTONToGame(database.DB(), middleware.UserID(c), req.Coins)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrExchangeDisabled):
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "exchange temporarily disabled",
				"details": "payment provider is not configured yet",
			})
			return
		case errors.Is(err, services.ErrAmountTooSmall):
			c.JSON(http.StatusBadRequest, gin.H{
				"error":     "coins amount must be >= 1",
				"min_coins": services.MinTopUpCoins,
				"rate":      "1 GAME = 0.1 TON",
			})
			return

		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "top up failed"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"rate":         "1 GAME = 0.1 TON",
		"coins":        req.Coins,
		"spent_ton":    requiredTON,
		"balance_game": user.BalanceGame,
		"balance": gin.H{
			"game": user.BalanceGame,
		},
	})
}

func (WalletHandler) DevGrantGame(c *gin.Context) {
	var req struct {
		Coins int64 `json:"coins" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	user, err := services.GrantGameCoins(database.DB(), middleware.UserID(c), req.Coins)
	if err != nil {
		if errors.Is(err, services.ErrAmountTooSmall) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "coins amount must be >= 1"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "grant failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"coins":   req.Coins,
		"balance": gin.H{
			"ton":  user.BalanceTON,
			"game": user.BalanceGame,
		},
	})
}

func (WalletHandler) DevAddTON(c *gin.Context) {
	c.JSON(http.StatusGone, gin.H{
		"error": "deprecated, use POST /api/v1/dev/grant-game",
	})
}
