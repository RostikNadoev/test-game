package database

import (
	"fmt"
	"log"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/services"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

func Init(cfg *config.Config) error {
	gormCfg := &gorm.Config{Logger: logger.Default.LogMode(logger.Warn)}
	conn, err := gorm.Open(postgres.Open(cfg.DatabaseDSN), gormCfg)
	if err != nil {
		return fmt.Errorf("connect postgres: %w", err)
	}

	if err := conn.AutoMigrate(
		&models.User{},
		&models.UserStats{},
		&models.UserSoloStats{},
		&models.WalletTransaction{},
		&models.BetReservation{},
		&models.Match{},
		&models.MatchFinishVote{},
		&models.LobbyRecord{},
		&models.LobbyPlayerRecord{},
		&models.SoloRound{},
		&models.SoloSession{},
		&models.GameSetting{},
		&models.AdminAuditLog{},
	); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}

	db = conn
	if err := services.SeedGameSettingsIfEmpty(conn); err != nil {
		return fmt.Errorf("seed game settings: %w", err)
	}
	log.Println("✅ PostgreSQL connected and migrated")
	return nil
}

func DB() *gorm.DB {
	if db == nil {
		panic("database is not initialized")
	}
	return db
}

func SetTestDB(conn *gorm.DB) {
	db = conn
}

func ResetTestDB() {
	db = nil
}

func Ping() error {
	if db == nil {
		return fmt.Errorf("database is not initialized")
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}
