package services

import (
	"strings"
	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/telegram"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func displayName(u telegram.WebAppUser) string {
	name := strings.TrimSpace(strings.TrimSpace(u.FirstName) + " " + strings.TrimSpace(u.LastName))
	if name != "" {
		return name
	}
	if strings.TrimSpace(u.Username) != "" {
		return u.Username
	}
	return "Telegram User"
}

func UpsertTelegramUser(db *gorm.DB, tg telegram.WebAppUser) (*models.User, error) {
	var user models.User
	err := db.Where("telegram_id = ?", tg.ID).First(&user).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	if err == gorm.ErrRecordNotFound {
		user = models.User{
			TelegramID:  tg.ID,
			Username:    tg.Username,
			FirstName:   tg.FirstName,
			LastName:    tg.LastName,
			DisplayName: displayName(tg),
			PhotoURL:    tg.PhotoURL,
		}
		if err := db.Create(&user).Error; err != nil {
			return nil, err
		}
		stats := models.UserStats{UserID: user.ID, Rating: 1000, FavoriteMode: "none"}
		if err := db.Create(&stats).Error; err != nil {
			return nil, err
		}
		user.Stats = stats
		return &user, nil
	}

	user.Username = tg.Username
	user.FirstName = tg.FirstName
	user.LastName = tg.LastName
	user.DisplayName = displayName(tg)
	user.PhotoURL = tg.PhotoURL
	if err := db.Save(&user).Error; err != nil {
		return nil, err
	}
	_ = EnsureUserStats(db, user.ID)
	if err := db.Preload("Stats").First(&user, user.ID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func EnsureUserStats(db *gorm.DB, userID uint) error {
	var stats models.UserStats
	err := db.Where("user_id = ?", userID).First(&stats).Error
	if err == nil {
		return nil
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}
	return db.Create(&models.UserStats{UserID: userID, Rating: 1000, FavoriteMode: "none"}).Error
}

func GetUserProfile(db *gorm.DB, userID uint) (*models.User, error) {
	if err := EnsureUserStats(db, userID); err != nil {
		return nil, err
	}
	var user models.User
	if err := db.Preload("Stats").First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func AddTONForDev(db *gorm.DB, userID uint, amount float64) (*models.User, error) {
	var user models.User
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		user.BalanceTON += amount
		return tx.Save(&user).Error
	})
	return &user, err
}
