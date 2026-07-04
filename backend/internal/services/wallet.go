package services

import (
	"encoding/json"
	"errors"
	"math"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	TONPerGameCoin = 0.1
	MinTopUpCoins  = 1
)

var (
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrAmountTooSmall      = errors.New("amount is below minimum")
	ErrInvalidAmountStep   = errors.New("invalid amount step")
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

// TopUpGameByCoins — пополнение игрового баланса.
// В игре хранится только BalanceGame.
// TON используется только как стоимость пополнения.
//
// 1 GAME = 0.1 TON
func TopUpGameByCoins(db *gorm.DB, userID uint, coins int64) (*models.User, float64, error) {
	if coins < MinTopUpCoins {
		return nil, 0, ErrAmountTooSmall
	}

	requiredTON := CoinsToTON(coins)

	var user models.User
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}

		user.BalanceGame = roundMoney(user.BalanceGame + float64(coins))

		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"rate":         "1 GAME = 0.1 TON",
			"coins":        coins,
			"required_ton": requiredTON,
			"ton_per_coin": TONPerGameCoin,
		})

		return tx.Create(&models.WalletTransaction{
			UserID:   userID,
			Type:     "topup_game_by_ton",
			Currency: "game",
			Amount:   float64(coins),
			Status:   "completed",
			Meta:     string(meta),
		}).Error
	})

	if err != nil {
		return nil, 0, err
	}

	return &user, requiredTON, nil
}