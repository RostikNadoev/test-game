package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"tg-lobbies-base/internal/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const matchRakePercent = 0.08

var (
	ErrMatchNotFound       = errors.New("match not found")
	ErrMatchAlreadySettled = errors.New("match already settled")
	ErrBetNotFound         = errors.New("bet reservation not found")
	ErrInvalidMatchState   = errors.New("invalid match state")
	ErrMatchVotePending    = errors.New("waiting for opponent confirmation")
)

type MatchFinishSubmitResult struct {
	Settled bool
	Pending bool
}

func ReserveBet(db *gorm.DB, userID uint, lobbyID string, amount float64) error {
	if userID == 0 || lobbyID == "" || amount <= 0 {
		return ErrInvalidAmountStep
	}

	return db.Transaction(func(tx *gorm.DB) error {
		var existing models.BetReservation
		err := tx.Where("lobby_id = ? AND user_id = ?", lobbyID, userID).First(&existing).Error
		if err == nil {
			if existing.Status == models.BetStatusReserved {
				return nil
			}
			return fmt.Errorf("bet reservation already processed")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		if user.BalanceGame+1e-9 < amount {
			return ErrInsufficientBalance
		}

		user.BalanceGame = roundMoney(user.BalanceGame - amount)
		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"lobby_id": lobbyID,
			"action":   "reserve",
		})

		if err := tx.Create(&models.WalletTransaction{
			UserID:   userID,
			Type:     "bet_reserve",
			Currency: "game",
			Amount:   -amount,
			Status:   "completed",
			Meta:     string(meta),
		}).Error; err != nil {
			return err
		}

		return tx.Create(&models.BetReservation{
			LobbyID: lobbyID,
			UserID:  userID,
			Amount:  amount,
			Status:  models.BetStatusReserved,
		}).Error
	})
}

func RefundBet(db *gorm.DB, userID uint, lobbyID string) error {
	if userID == 0 || lobbyID == "" {
		return ErrInvalidAmountStep
	}

	return db.Transaction(func(tx *gorm.DB) error {
		var reservation models.BetReservation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("lobby_id = ? AND user_id = ?", lobbyID, userID).
			First(&reservation).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if reservation.Status != models.BetStatusReserved {
			return nil
		}

		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}

		user.BalanceGame = roundMoney(user.BalanceGame + reservation.Amount)
		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"lobby_id": lobbyID,
			"action":   "refund",
		})

		if err := tx.Create(&models.WalletTransaction{
			UserID:   userID,
			Type:     "bet_refund",
			Currency: "game",
			Amount:   reservation.Amount,
			Status:   "completed",
			Meta:     string(meta),
		}).Error; err != nil {
			return err
		}

		reservation.Status = models.BetStatusRefunded
		return tx.Save(&reservation).Error
	})
}

func CreateMatch(db *gorm.DB, lobbyID, game string, bet float64, playerIDs []uint) (*models.Match, error) {
	if len(playerIDs) != 2 {
		return nil, ErrInvalidMatchState
	}

	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	var match models.Match
	err := db.Where("lobby_id = ?", lobbyID).First(&match).Error
	if err == nil {
		return &match, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	match = models.Match{
		LobbyID:   lobbyID,
		Game:      game,
		BetCoins:  bet,
		Player1ID: ids[0],
		Player2ID: ids[1],
		Status:    models.MatchStatusPlaying,
	}

	if err := db.Create(&match).Error; err != nil {
		return nil, err
	}

	return &match, nil
}

func SettleMatch(db *gorm.DB, lobbyID string, winnerUserID *uint) (*models.Match, error) {
	var settledMatch models.Match

	err := db.Transaction(func(tx *gorm.DB) error {
		var match models.Match
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("lobby_id = ?", lobbyID).
			First(&match).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMatchNotFound
			}
			return err
		}

		if match.Status == models.MatchStatusFinished && match.SettledAt != nil {
			settledMatch = match
			return ErrMatchAlreadySettled
		}

		playerIDs := []uint{match.Player1ID, match.Player2ID}
		draw := winnerUserID == nil

		if !draw {
			validWinner := *winnerUserID == match.Player1ID || *winnerUserID == match.Player2ID
			if !validWinner {
				return ErrInvalidMatchState
			}
		}

		if draw {
			for _, pid := range playerIDs {
				if err := refundReservedBetTx(tx, pid, lobbyID); err != nil {
					return err
				}
			}
		} else {
			pot := roundMoney(match.BetCoins * 2)
			payout := roundMoney(pot * (1 - matchRakePercent))

			if err := markBetSettledTx(tx, match.Player1ID, lobbyID); err != nil {
				return err
			}
			if err := markBetSettledTx(tx, match.Player2ID, lobbyID); err != nil {
				return err
			}

			var winner models.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&winner, *winnerUserID).Error; err != nil {
				return err
			}
			winner.BalanceGame = roundMoney(winner.BalanceGame + payout)
			if err := tx.Save(&winner).Error; err != nil {
				return err
			}

			meta, _ := json.Marshal(map[string]any{
				"lobby_id":    lobbyID,
				"winner_id":   *winnerUserID,
				"pot":         pot,
				"rake":        roundMoney(pot - payout),
				"game":        match.Game,
			})

			if err := tx.Create(&models.WalletTransaction{
				UserID:   *winnerUserID,
				Type:     "match_payout",
				Currency: "game",
				Amount:   payout,
				Status:   "completed",
				Meta:     string(meta),
			}).Error; err != nil {
				return err
			}

			loserID := match.Player1ID
			if loserID == *winnerUserID {
				loserID = match.Player2ID
			}
			if err := ApplyMatchResultTx(tx, *winnerUserID, loserID, match.Game, false); err != nil {
				return err
			}
		}

		if draw {
			if err := ApplyMatchResultTx(tx, match.Player1ID, match.Player2ID, match.Game, true); err != nil {
				return err
			}
		}

		now := time.Now().UTC()
		match.WinnerUserID = winnerUserID
		match.Status = models.MatchStatusFinished
		match.SettledAt = &now
		if err := tx.Save(&match).Error; err != nil {
			return err
		}

		settledMatch = match
		return nil
	})

	if errors.Is(err, ErrMatchAlreadySettled) {
		return &settledMatch, nil
	}
	if err != nil {
		return nil, err
	}

	return &settledMatch, nil
}

func SettleMatchFromLobby(db *gorm.DB, lobbyID string, winnerUserID *uint) error {
	_, err := SettleMatch(db, lobbyID, winnerUserID)
	if errors.Is(err, ErrMatchAlreadySettled) {
		return nil
	}
	return err
}

func winnerPtrEqual(a, b *uint) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func SubmitMatchFinishVote(db *gorm.DB, lobbyID string, userID uint, winnerUserID *uint) (*MatchFinishSubmitResult, error) {
	var result MatchFinishSubmitResult

	err := db.Transaction(func(tx *gorm.DB) error {
		var match models.Match
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("lobby_id = ?", lobbyID).
			First(&match).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMatchNotFound
			}
			return err
		}

		if match.Status == models.MatchStatusFinished && match.SettledAt != nil {
			result.Settled = true
			return nil
		}

		if userID != match.Player1ID && userID != match.Player2ID {
			return ErrInvalidMatchState
		}

		if winnerUserID != nil && *winnerUserID != match.Player1ID && *winnerUserID != match.Player2ID {
			return ErrInvalidMatchState
		}

		vote := models.MatchFinishVote{
			LobbyID:      lobbyID,
			UserID:       userID,
			WinnerUserID: winnerUserID,
		}
		var existing models.MatchFinishVote
		findErr := tx.Where("lobby_id = ? AND user_id = ?", lobbyID, userID).First(&existing).Error
		if findErr == nil {
			existing.WinnerUserID = winnerUserID
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
		} else if errors.Is(findErr, gorm.ErrRecordNotFound) {
			if err := tx.Create(&vote).Error; err != nil {
				return err
			}
		} else {
			return findErr
		}

		var votes []models.MatchFinishVote
		if err := tx.Where("lobby_id = ?", lobbyID).Find(&votes).Error; err != nil {
			return err
		}
		if len(votes) < 2 {
			result.Pending = true
			return nil
		}

		agreedWinner := votes[0].WinnerUserID
		for _, voteItem := range votes[1:] {
			if !winnerPtrEqual(agreedWinner, voteItem.WinnerUserID) {
				agreedWinner = nil
				break
			}
		}

		if _, err := SettleMatch(tx, lobbyID, agreedWinner); err != nil {
			if errors.Is(err, ErrMatchAlreadySettled) {
				result.Settled = true
				return tx.Where("lobby_id = ?", lobbyID).Delete(&models.MatchFinishVote{}).Error
			}
			return err
		}

		if err := tx.Where("lobby_id = ?", lobbyID).Delete(&models.MatchFinishVote{}).Error; err != nil {
			return err
		}

		result.Settled = true
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &result, nil
}

func refundReservedBetTx(tx *gorm.DB, userID uint, lobbyID string) error {
	var reservation models.BetReservation
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("lobby_id = ? AND user_id = ?", lobbyID, userID).
		First(&reservation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if reservation.Status != models.BetStatusReserved {
		return nil
	}

	var user models.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
		return err
	}

	user.BalanceGame = roundMoney(user.BalanceGame + reservation.Amount)
	if err := tx.Save(&user).Error; err != nil {
		return err
	}

	meta, _ := json.Marshal(map[string]any{"lobby_id": lobbyID, "action": "draw_refund"})
	if err := tx.Create(&models.WalletTransaction{
		UserID:   userID,
		Type:     "bet_refund",
		Currency: "game",
		Amount:   reservation.Amount,
		Status:   "completed",
		Meta:     string(meta),
	}).Error; err != nil {
		return err
	}

	reservation.Status = models.BetStatusRefunded
	return tx.Save(&reservation).Error
}

func markBetSettledTx(tx *gorm.DB, userID uint, lobbyID string) error {
	var reservation models.BetReservation
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("lobby_id = ? AND user_id = ?", lobbyID, userID).
		First(&reservation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if reservation.Status == models.BetStatusSettled {
		return nil
	}
	reservation.Status = models.BetStatusSettled
	return tx.Save(&reservation).Error
}

func GrantGameCoins(db *gorm.DB, userID uint, coins int64) (*models.User, error) {
	if coins < 1 {
		return nil, ErrAmountTooSmall
	}

	var user models.User
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}

		user.BalanceGame = roundMoney(user.BalanceGame + float64(coins))
		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{"source": "dev_grant"})
		return tx.Create(&models.WalletTransaction{
			UserID:   userID,
			Type:     "dev_grant_game",
			Currency: "game",
			Amount:   float64(coins),
			Status:   "completed",
			Meta:     string(meta),
		}).Error
	})

	if err != nil {
		return nil, err
	}

	return &user, nil
}
