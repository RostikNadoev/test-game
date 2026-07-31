package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const nanoTONPerGameCoin int64 = 100_000_000
const maxWithdrawalGameAmount int64 = 90_000_000_000

var (
	ErrInvalidWithdrawalAmount = errors.New("withdrawal amount must be a positive whole number")
	ErrInvalidWalletAddress    = errors.New("invalid TON wallet address")
	ErrInvalidIdempotencyKey   = errors.New("invalid idempotency key")
	ErrWithdrawalNotFound      = errors.New("withdrawal request not found")
	ErrInvalidWithdrawalState  = errors.New("invalid withdrawal state")

	userFriendlyTONAddressPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{48}$`)
	rawTONAddressPattern          = regexp.MustCompile(`^(?:-1|0):[A-Fa-f0-9]{64}$`)
	idempotencyKeyPattern         = regexp.MustCompile(`^[A-Za-z0-9_-]{8,80}$`)
)

type WithdrawalDetails struct {
	Request models.WithdrawalRequest
	User    models.User
}

type WithdrawalCreateResult struct {
	Details     WithdrawalDetails
	BalanceGame float64
	Existing    bool
}

func CreateWithdrawal(db *gorm.DB, userID uint, gameAmount int64, walletAddress, idempotencyKey string) (*WithdrawalCreateResult, error) {
	walletAddress = strings.TrimSpace(walletAddress)
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if userID == 0 || gameAmount <= 0 || gameAmount > maxWithdrawalGameAmount {
		return nil, ErrInvalidWithdrawalAmount
	}
	if !isValidTONAddress(walletAddress) {
		return nil, ErrInvalidWalletAddress
	}
	if !idempotencyKeyPattern.MatchString(idempotencyKey) {
		return nil, ErrInvalidIdempotencyKey
	}

	result := &WithdrawalCreateResult{}
	err := db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUserNotFound
			}
			return err
		}

		var existing models.WithdrawalRequest
		err := tx.Where("user_id = ? AND idempotency_key = ?", userID, idempotencyKey).First(&existing).Error
		if err == nil {
			result.Details = WithdrawalDetails{Request: existing, User: user}
			result.BalanceGame = user.BalanceGame
			result.Existing = true
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		if user.BalanceGame+1e-9 < float64(gameAmount) {
			return ErrInsufficientBalance
		}

		request := models.WithdrawalRequest{
			UserID:         userID,
			IdempotencyKey: idempotencyKey,
			WalletAddress:  walletAddress,
			GameAmount:     gameAmount,
			TonNanoAmount:  gameAmount * nanoTONPerGameCoin,
			Status:         models.WithdrawalStatusPending,
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}

		user.BalanceGame = roundMoney(user.BalanceGame - float64(gameAmount))
		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"action":         "withdrawal_request",
			"withdrawal_id":  request.ID,
			"wallet_address": walletAddress,
			"ton_amount":     FormatTONNano(request.TonNanoAmount),
		})
		walletTx := models.WalletTransaction{
			UserID:   userID,
			Type:     "withdrawal",
			Currency: "game",
			Amount:   -float64(gameAmount),
			Status:   models.WithdrawalStatusPending,
			Meta:     string(meta),
		}
		if err := tx.Create(&walletTx).Error; err != nil {
			return err
		}
		if err := tx.Model(&request).Update("wallet_transaction_id", walletTx.ID).Error; err != nil {
			return err
		}
		request.WalletTransactionID = walletTx.ID

		result.Details = WithdrawalDetails{Request: request, User: user}
		result.BalanceGame = user.BalanceGame
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func CompleteWithdrawal(db *gorm.DB, requestID uint) (*WithdrawalDetails, error) {
	if requestID == 0 {
		return nil, ErrWithdrawalNotFound
	}

	var request models.WithdrawalRequest
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&request, requestID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrWithdrawalNotFound
			}
			return err
		}
		if request.Status == models.WithdrawalStatusCompleted {
			return nil
		}
		if request.Status != models.WithdrawalStatusPending {
			return ErrInvalidWithdrawalState
		}

		now := time.Now().UTC()
		request.Status = models.WithdrawalStatusCompleted
		request.CompletedAt = &now
		if err := tx.Save(&request).Error; err != nil {
			return err
		}
		if request.WalletTransactionID != 0 {
			if err := tx.Model(&models.WalletTransaction{}).
				Where("id = ?", request.WalletTransactionID).
				Update("status", models.WithdrawalStatusCompleted).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return LoadWithdrawalDetails(db, request.ID)
}

func LoadWithdrawalDetails(db *gorm.DB, requestID uint) (*WithdrawalDetails, error) {
	var request models.WithdrawalRequest
	if err := db.First(&request, requestID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWithdrawalNotFound
		}
		return nil, err
	}
	var user models.User
	if err := db.First(&user, request.UserID).Error; err != nil {
		return nil, err
	}
	return &WithdrawalDetails{Request: request, User: user}, nil
}

func ListWithdrawals(db *gorm.DB, userID uint, limit int) ([]models.WithdrawalRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []models.WithdrawalRequest
	err := db.Where("user_id = ?", userID).Order("created_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func ListUnnotifiedWithdrawals(db *gorm.DB, limit int) ([]WithdrawalDetails, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var rows []models.WithdrawalRequest
	if err := db.Where("status = ? AND bot_message_id = 0", models.WithdrawalStatusPending).
		Order("created_at ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]WithdrawalDetails, 0, len(rows))
	for _, row := range rows {
		var user models.User
		if err := db.First(&user, row.UserID).Error; err != nil {
			return nil, err
		}
		result = append(result, WithdrawalDetails{Request: row, User: user})
	}
	return result, nil
}

func MarkWithdrawalNotified(db *gorm.DB, requestID uint, chatID int64, messageID int) error {
	now := time.Now().UTC()
	return db.Model(&models.WithdrawalRequest{}).Where("id = ? AND bot_message_id = 0", requestID).Updates(map[string]any{
		"bot_chat_id":            chatID,
		"bot_message_id":         messageID,
		"bot_notified_at":        &now,
		"bot_notification_error": "",
	}).Error
}

func SetWithdrawalNotificationError(db *gorm.DB, requestID uint, notificationErr error) error {
	message := "unknown error"
	if notificationErr != nil {
		message = notificationErr.Error()
	}
	if len(message) > 500 {
		message = message[:500]
	}
	return db.Model(&models.WithdrawalRequest{}).Where("id = ?", requestID).
		Update("bot_notification_error", message).Error
}

func FormatTONNano(amount int64) string {
	if amount < 0 {
		return "-" + FormatTONNano(-amount)
	}
	whole := amount / 1_000_000_000
	fraction := amount % 1_000_000_000
	if fraction == 0 {
		return fmt.Sprintf("%d", whole)
	}
	return fmt.Sprintf("%d.%s", whole, strings.TrimRight(fmt.Sprintf("%09d", fraction), "0"))
}

func isValidTONAddress(address string) bool {
	return userFriendlyTONAddressPattern.MatchString(address) || rawTONAddressPattern.MatchString(address)
}
