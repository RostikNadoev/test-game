package handlers

import (
	"errors"
	"net/http"
	"tg-lobbies-base/internal/database"
	"tg-lobbies-base/internal/middleware"
	"tg-lobbies-base/internal/services"

	"github.com/gin-gonic/gin"
)

type WalletHandler struct{}

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

	user, requiredTON, err := services.TopUpGameByCoins(database.DB(), middleware.UserID(c), req.Coins)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrAmountTooSmall):
			c.JSON(http.StatusBadRequest, gin.H{
				"error":     "coins amount must be >= 1",
				"min_coins": services.MinTopUpCoins,
				"rate":      "1 GAME = 0.1 TON",
			})
			return

		default:
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "top up failed",
				"details": err.Error(),
			})
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

func (WalletHandler) DevAddTON(c *gin.Context) {
	c.JSON(http.StatusGone, gin.H{
		"error": "TON balance is deprecated. Use /api/v1/wallet/exchange-ton-to-game with coins instead.",
	})
}
