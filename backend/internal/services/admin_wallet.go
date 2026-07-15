package services

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func ValidateSoloBet(code string, bet float64) error {
	cfg, err := GetSoloGameConfig(code)
	if err != nil {
		return err
	}
	if bet < cfg.MinBet-1e-9 || bet > cfg.MaxBet+1e-9 {
		return solo.ErrInvalidBet
	}
	return nil
}

func IsSoloInstant(code string) bool {
	cfg, err := GetSoloGameConfig(code)
	return err == nil && cfg.Mode == solo.ModeInstant
}

func IsSoloSession(code string) bool {
	cfg, err := GetSoloGameConfig(code)
	return err == nil && cfg.Mode == solo.ModeSession
}

type AdminWalletAdjustInput struct {
	Currency  string
	Operation string
	Amount    float64
	Reason    string
}

type AdminWalletAdjustResult struct {
	User        models.User             `json:"user"`
	Transaction models.WalletTransaction `json:"transaction"`
}

func AdminAdjustWallet(db *gorm.DB, userID uint, input AdminWalletAdjustInput, adminUsername, ip string) (*AdminWalletAdjustResult, error) {
	currency := strings.ToLower(strings.TrimSpace(input.Currency))
	operation := strings.ToLower(strings.TrimSpace(input.Operation))
	amount := roundMoney(input.Amount)
	reason := strings.TrimSpace(input.Reason)
	if reason == "" {
		return nil, errors.New("reason is required")
	}
	if amount <= 0 {
		return nil, errors.New("amount must be greater than 0")
	}
	if currency != "game" && currency != "ton" {
		return nil, ErrInvalidCurrency
	}
	switch operation {
	case "credit":
	case "debit":
		amount = -amount
	default:
		return nil, errors.New("operation must be credit or debit")
	}

	var user models.User
	var txRow models.WalletTransaction
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUserNotFound
			}
			return err
		}

		before := map[string]any{
			"balance_game": user.BalanceGame,
			"balance_ton":  user.BalanceTON,
		}

		switch currency {
		case "game":
			next := roundMoney(user.BalanceGame + amount)
			if next < 0 {
				return ErrNegativeBalance
			}
			user.BalanceGame = next
		case "ton":
			next := roundMoney(user.BalanceTON + amount)
			if next < 0 {
				return ErrNegativeBalance
			}
			user.BalanceTON = next
		}

		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"admin":  adminUsername,
			"reason": reason,
			"action": "adjust",
		})
		txRow = models.WalletTransaction{
			UserID:   userID,
			Type:     "admin_adjust",
			Currency: currency,
			Amount:   amount,
			Status:   "completed",
			Meta:     string(meta),
		}
		if err := tx.Create(&txRow).Error; err != nil {
			return err
		}

		after := map[string]any{
			"balance_game": user.BalanceGame,
			"balance_ton":  user.BalanceTON,
		}
		return RecordAdminAction(tx, adminUsername, "wallet_adjust", "user", formatUint(userID), reason, ip, before, after)
	})
	if err != nil {
		return nil, err
	}
	return &AdminWalletAdjustResult{User: user, Transaction: txRow}, nil
}

func formatUint(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}
