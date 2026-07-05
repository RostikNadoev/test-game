package testdb

import (
	"testing"

	"tg-lobbies-base/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func Open(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.UserStats{},
		&models.WalletTransaction{},
		&models.BetReservation{},
		&models.Match{},
		&models.LobbyRecord{},
		&models.LobbyPlayerRecord{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	return db
}

func SeedUser(t *testing.T, db *gorm.DB, id uint, balance float64) *models.User {
	t.Helper()

	user := &models.User{
		ID:          id,
		TelegramID:  int64(id) + 1000,
		Username:    "player",
		DisplayName: "Player",
		BalanceGame: balance,
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := db.Create(&models.UserStats{UserID: user.ID, Rating: 1000}).Error; err != nil {
		t.Fatalf("create stats: %v", err)
	}

	return user
}

func ReloadUser(t *testing.T, db *gorm.DB, id uint) models.User {
	t.Helper()

	var user models.User
	if err := db.First(&user, id).Error; err != nil {
		t.Fatalf("reload user: %v", err)
	}

	return user
}
