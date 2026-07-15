package services

import (
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ratingWinDelta  = 25
	ratingLossDelta = 15
	ratingDrawDelta = 5
)

func ApplyMatchResult(db *gorm.DB, winnerID, loserID uint, game string, draw bool) error {
	return db.Transaction(func(tx *gorm.DB) error {
		if draw {
			if err := applyDrawStatsTx(tx, winnerID, game); err != nil {
				return err
			}
			return applyDrawStatsTx(tx, loserID, game)
		}
		if err := applyWinStatsTx(tx, winnerID, game); err != nil {
			return err
		}
		return applyLossStatsTx(tx, loserID, game)
	})
}

func ApplyMatchResultTx(tx *gorm.DB, winnerID, loserID uint, game string, draw bool) error {
	if draw {
		if err := applyDrawStatsTx(tx, winnerID, game); err != nil {
			return err
		}
		return applyDrawStatsTx(tx, loserID, game)
	}
	if err := applyWinStatsTx(tx, winnerID, game); err != nil {
		return err
	}
	return applyLossStatsTx(tx, loserID, game)
}

func applyWinStatsTx(tx *gorm.DB, userID uint, game string) error {
	if err := EnsureUserStats(tx, userID); err != nil {
		return err
	}

	var stats models.UserStats
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&stats).Error; err != nil {
		return err
	}

	stats.Wins++
	stats.Rating += ratingWinDelta
	if game != "" {
		stats.FavoriteMode = game
	}

	return tx.Save(&stats).Error
}

func applyLossStatsTx(tx *gorm.DB, userID uint, game string) error {
	if err := EnsureUserStats(tx, userID); err != nil {
		return err
	}

	var stats models.UserStats
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&stats).Error; err != nil {
		return err
	}

	stats.Losses++
	stats.Rating -= ratingLossDelta
	if stats.Rating < 0 {
		stats.Rating = 0
	}
	_ = game

	return tx.Save(&stats).Error
}

func applyDrawStatsTx(tx *gorm.DB, userID uint, game string) error {
	if err := EnsureUserStats(tx, userID); err != nil {
		return err
	}

	var stats models.UserStats
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&stats).Error; err != nil {
		return err
	}

	stats.Rating += ratingDrawDelta
	_ = game

	return tx.Save(&stats).Error
}

type LeaderboardEntry struct {
	ID       uint   `json:"id"`
	TgUser   string `json:"tg_user"`
	PhotoURL string `json:"photo_url"`
	Rating   int    `json:"rating"`
	Wins     int    `json:"wins"`
}

func GetLeaderboard(db *gorm.DB, limit int) ([]LeaderboardEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	type row struct {
		ID         uint
		Username   string
		FirstName  string
		LastName   string
		DisplayName string
		PhotoURL   string
		Rating     int
		Wins       int
	}

	var rows []row
	err := db.Table("user_stats").
		Select("users.id, users.username, users.first_name, users.last_name, users.display_name, users.photo_url, user_stats.rating, user_stats.wins").
		Joins("JOIN users ON users.id = user_stats.user_id").
		Order("user_stats.rating DESC, user_stats.wins DESC, users.id ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]LeaderboardEntry, 0, len(rows))
	for _, r := range rows {
		user := models.User{
			ID:          r.ID,
			Username:    r.Username,
			FirstName:   r.FirstName,
			LastName:    r.LastName,
			DisplayName: r.DisplayName,
			PhotoURL:    r.PhotoURL,
		}
		out = append(out, LeaderboardEntry{
			ID:       r.ID,
			TgUser:   UserDisplayLabel(&user),
			PhotoURL: r.PhotoURL,
			Rating:   r.Rating,
			Wins:     r.Wins,
		})
	}

	return out, nil
}
