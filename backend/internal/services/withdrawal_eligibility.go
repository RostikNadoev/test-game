package services

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

const (
	MinimumWithdrawalGameAmount int64 = 10
	MinimumWithdrawalGames            = 10
	WithdrawalWalletCooldown          = 24 * time.Hour
)

var ErrWithdrawalLocked = errors.New("withdrawal is locked")

var depositTransactionTypes = []string{
	"deposit",
	"topup",
	"top_up",
	"ton_deposit",
	"exchange_ton_to_game",
}

var bonusTransactionTypes = []string{
	"bonus",
	"welcome_bonus",
	"referral_bonus",
	"promo_bonus",
}

type WithdrawalEligibility struct {
	Eligible             bool       `json:"eligible"`
	MinimumAmount        int64      `json:"minimum_amount"`
	WalletVerified       bool       `json:"wallet_verified"`
	RequiredWallet       string     `json:"required_wallet,omitempty"`
	GamesCompleted       int64      `json:"games_completed"`
	GamesRequired        int64      `json:"games_required"`
	WageredGame          float64    `json:"wagered_game"`
	WagerRequiredGame    float64    `json:"wager_required_game"`
	DepositWagerRequired float64    `json:"deposit_wager_required"`
	BonusWagerRequired   float64    `json:"bonus_wager_required"`
	BalanceGame          float64    `json:"balance_game"`
	BalanceReady         bool       `json:"balance_ready"`
	NoPendingWithdrawal  bool       `json:"no_pending_withdrawal"`
	NoActiveGame         bool       `json:"no_active_game"`
	WalletCooldownReady  bool       `json:"wallet_cooldown_ready"`
	WalletCooldownUntil  *time.Time `json:"wallet_cooldown_until,omitempty"`
}

type WithdrawalLockedError struct {
	Eligibility WithdrawalEligibility
}

func (e *WithdrawalLockedError) Error() string { return ErrWithdrawalLocked.Error() }

func (e *WithdrawalLockedError) Is(target error) bool { return target == ErrWithdrawalLocked }

func CheckWithdrawalEligibility(db *gorm.DB, userID uint, walletAddress string) (*WithdrawalEligibility, error) {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	eligibility, err := withdrawalEligibilityTx(db, user, walletAddress, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	return &eligibility, nil
}

func withdrawalEligibilityTx(db *gorm.DB, user models.User, walletAddress string, now time.Time) (WithdrawalEligibility, error) {
	result := WithdrawalEligibility{
		MinimumAmount:       MinimumWithdrawalGameAmount,
		GamesRequired:       MinimumWithdrawalGames,
		BalanceGame:         roundMoney(user.BalanceGame),
		BalanceReady:        user.BalanceGame+1e-9 >= float64(MinimumWithdrawalGameAmount),
		NoPendingWithdrawal: true,
		NoActiveGame:        true,
		WalletCooldownReady: true,
	}

	var lastCompleted models.WithdrawalRequest
	boundary := time.Time{}
	err := db.Where("user_id = ? AND status = ?", user.ID, models.WithdrawalStatusCompleted).
		Order("completed_at DESC").First(&lastCompleted).Error
	if err == nil && lastCompleted.CompletedAt != nil {
		boundary = lastCompleted.CompletedAt.UTC()
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}

	var walletRows []models.WalletTransaction
	if err := db.Where(
		"user_id = ? AND status = ? AND currency = ? AND amount > 0 AND type IN ?",
		user.ID,
		"completed",
		"game",
		depositTransactionTypes,
	).Order("created_at ASC, id ASC").Find(&walletRows).Error; err != nil {
		return result, err
	}

	var lastWallet string
	var walletChangedAt *time.Time
	for _, row := range walletRows {
		address := walletAddressFromMeta(row.Meta)
		if address != "" {
			if lastWallet != "" && address != lastWallet {
				changedAt := row.CreatedAt.UTC()
				walletChangedAt = &changedAt
			}
			lastWallet = address
		}
		if row.CreatedAt.After(boundary) {
			result.DepositWagerRequired = roundMoney(result.DepositWagerRequired + row.Amount)
		}
	}
	result.RequiredWallet = lastWallet
	walletAddress = strings.TrimSpace(walletAddress)
	result.WalletVerified = isValidTONAddress(walletAddress) && lastWallet != "" && walletAddress == lastWallet

	if walletChangedAt != nil {
		cooldownUntil := walletChangedAt.Add(WithdrawalWalletCooldown)
		if now.Before(cooldownUntil) {
			result.WalletCooldownReady = false
			result.WalletCooldownUntil = &cooldownUntil
		}
	}

	var bonusTotal float64
	if err := db.Model(&models.WalletTransaction{}).
		Where(
			"user_id = ? AND status = ? AND currency = ? AND amount > 0 AND type IN ? AND created_at > ?",
			user.ID,
			"completed",
			"game",
			bonusTransactionTypes,
			boundary,
		).
		Select("COALESCE(SUM(amount), 0)").Scan(&bonusTotal).Error; err != nil {
		return result, err
	}
	result.BonusWagerRequired = roundMoney(bonusTotal * 3)
	result.WagerRequiredGame = roundMoney(result.DepositWagerRequired + result.BonusWagerRequired)

	completedGames, wagered, err := withdrawalGameProgress(db, user.ID, boundary)
	if err != nil {
		return result, err
	}
	result.GamesCompleted = completedGames
	result.WageredGame = roundMoney(wagered)

	var pendingCount int64
	if err := db.Model(&models.WithdrawalRequest{}).
		Where("user_id = ? AND status = ?", user.ID, models.WithdrawalStatusPending).
		Count(&pendingCount).Error; err != nil {
		return result, err
	}
	result.NoPendingWithdrawal = pendingCount == 0

	var activeSoloCount int64
	if err := db.Model(&models.SoloSession{}).
		Where("user_id = ? AND status = ?", user.ID, models.SoloSessionStatusActive).
		Count(&activeSoloCount).Error; err != nil {
		return result, err
	}

	var activeMatchCount int64
	if err := db.Model(&models.Match{}).
		Where("status = ? AND (player1_id = ? OR player2_id = ?)", models.MatchStatusPlaying, user.ID, user.ID).
		Count(&activeMatchCount).Error; err != nil {
		return result, err
	}
	result.NoActiveGame = activeSoloCount == 0 && activeMatchCount == 0

	result.Eligible = result.WalletVerified &&
		result.GamesCompleted >= result.GamesRequired &&
		result.WageredGame+1e-9 >= result.WagerRequiredGame &&
		result.BalanceReady &&
		result.NoPendingWithdrawal &&
		result.NoActiveGame &&
		result.WalletCooldownReady

	return result, nil
}

func withdrawalGameProgress(db *gorm.DB, userID uint, boundary time.Time) (int64, float64, error) {
	var totalGames int64
	var wagered float64

	type aggregate struct {
		Games   int64
		Wagered float64
	}
	var result aggregate

	if err := db.Model(&models.SoloRound{}).
		Where("user_id = ? AND status = ?", userID, models.SoloRoundStatusSettled).
		Select("COUNT(*) AS games, COALESCE(SUM(CASE WHEN created_at > ? THEN bet_coins ELSE 0 END), 0) AS wagered", boundary).
		Scan(&result).Error; err != nil {
		return 0, 0, err
	}
	totalGames += result.Games
	wagered += result.Wagered

	result = aggregate{}
	if err := db.Model(&models.SoloSession{}).
		Where("user_id = ? AND status IN ?", userID, []string{
			models.SoloSessionStatusCashedOut,
			models.SoloSessionStatusBust,
			models.SoloSessionStatusCompleted,
		}).
		Select("COUNT(*) AS games, COALESCE(SUM(CASE WHEN created_at > ? THEN bet_coins ELSE 0 END), 0) AS wagered", boundary).
		Scan(&result).Error; err != nil {
		return 0, 0, err
	}
	totalGames += result.Games
	wagered += result.Wagered

	result = aggregate{}
	if err := db.Model(&models.Match{}).
		Where("status = ? AND (player1_id = ? OR player2_id = ?)", models.MatchStatusFinished, userID, userID).
		Select("COUNT(*) AS games, COALESCE(SUM(CASE WHEN created_at > ? THEN bet_coins ELSE 0 END), 0) AS wagered", boundary).
		Scan(&result).Error; err != nil {
		return 0, 0, err
	}
	totalGames += result.Games
	wagered += result.Wagered

	return totalGames, wagered, nil
}

func walletAddressFromMeta(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}

	var meta map[string]any
	if err := json.Unmarshal([]byte(raw), &meta); err != nil {
		return ""
	}
	for _, key := range []string{"wallet_address", "sender_address", "source_address", "from_address", "from"} {
		if value, ok := meta[key].(string); ok {
			value = strings.TrimSpace(value)
			if isValidTONAddress(value) {
				return value
			}
		}
	}
	return ""
}
