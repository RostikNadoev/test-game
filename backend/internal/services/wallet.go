package services

import (
	"errors"
	"math"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

const (
	TONPerGameCoin = 0.1
	MinTopUpCoins  = 1
)

var (
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrAmountTooSmall      = errors.New("amount is below minimum")
	ErrInvalidAmountStep   = errors.New("invalid amount step")
	ErrExchangeDisabled    = errors.New("exchange disabled until payment provider is configured")
)

func roundMoney(v float64) float64 {
	return math.Round(v*1e9) / 1e9
}

func CoinsToTON(coins int64) float64 {
	return roundMoney(float64(coins) * TONPerGameCoin)
}

func TONToCoins(amountTON float64) int64 {
	return int64(math.Floor((amountTON / TONPerGameCoin) + 1e-9))
}

// ExchangeTONToGame is temporarily disabled until an external payment provider confirms TON transfers.
func ExchangeTONToGame(_ *gorm.DB, _ uint, _ int64) (*models.User, float64, error) {
	return nil, 0, ErrExchangeDisabled
}