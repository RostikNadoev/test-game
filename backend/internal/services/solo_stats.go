package services

import (
	"errors"
	"time"

	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SoloStatsDTO struct {
	TotalSpins       int        `json:"total_spins"`
	TotalWagered     float64    `json:"total_wagered"`
	TotalWon         float64    `json:"total_won"`
	BiggestWin       float64    `json:"biggest_win"`
	FavoriteSoloGame string     `json:"favorite_solo_game"`
	LastPlayedAt     *time.Time `json:"last_played_at,omitempty"`
}

func EnsureUserSoloStats(db *gorm.DB, userID uint) error {
	var stats models.UserSoloStats
	err := db.Where("user_id = ?", userID).First(&stats).Error
	if err == nil {
		return nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return db.Create(&models.UserSoloStats{UserID: userID}).Error
	}
	return err
}

func GetUserSoloStats(db *gorm.DB, userID uint) (SoloStatsDTO, error) {
	if err := EnsureUserSoloStats(db, userID); err != nil {
		return SoloStatsDTO{}, err
	}
	var stats models.UserSoloStats
	if err := db.Where("user_id = ?", userID).First(&stats).Error; err != nil {
		return SoloStatsDTO{}, err
	}
	return soloStatsDTO(stats), nil
}

func soloStatsDTO(stats models.UserSoloStats) SoloStatsDTO {
	return SoloStatsDTO{
		TotalSpins:       stats.TotalSpins,
		TotalWagered:     stats.TotalWagered,
		TotalWon:         stats.TotalWon,
		BiggestWin:       stats.BiggestWin,
		FavoriteSoloGame: stats.FavoriteSoloGame,
		LastPlayedAt:     stats.LastPlayedAt,
	}
}

func ApplySoloResultTx(tx *gorm.DB, userID uint, game string, bet, payout float64) error {
	if err := EnsureUserSoloStats(tx, userID); err != nil {
		return err
	}

	var stats models.UserSoloStats
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&stats).Error; err != nil {
		return err
	}

	now := time.Now().UTC()
	stats.TotalSpins++
	stats.TotalWagered = roundMoney(stats.TotalWagered + bet)
	stats.TotalWon = roundMoney(stats.TotalWon + payout)
	if payout > stats.BiggestWin {
		stats.BiggestWin = payout
	}
	if solo.NormalizeGame(game) != "" {
		stats.FavoriteSoloGame = solo.NormalizeGame(game)
	}
	stats.LastPlayedAt = &now

	return tx.Save(&stats).Error
}
