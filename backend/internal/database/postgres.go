package database

import (
	"fmt"
	"log"
	"tg-lobbies-base/internal/config"
	"tg-lobbies-base/internal/models"

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
		&models.WalletTransaction{},
	); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}

	db = conn
	log.Println("✅ PostgreSQL connected and migrated")
	return nil
}

func DB() *gorm.DB {
	if db == nil {
		panic("database is not initialized")
	}
	return db
}
