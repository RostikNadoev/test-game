package catalog

import (
	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

func DefaultGameSettings() []models.GameSetting {
	out := make([]models.GameSetting, 0, len(PvpGames)+8)
	order := 0
	for _, g := range PvpGames {
		out = append(out, models.GameSetting{
			Code:      g.Code,
			Kind:      "pvp",
			Enabled:   true,
			Title:     g.DisplayName,
			MinBet:    1,
			MaxBet:    500,
			SortOrder: order,
		})
		order++
	}
	for _, g := range solo.ListGames() {
		out = append(out, models.GameSetting{
			Code:      g.Code,
			Kind:      "solo",
			Enabled:   true,
			Title:     g.Title,
			MinBet:    g.MinBet,
			MaxBet:    g.MaxBet,
			SortOrder: order,
		})
		order++
	}
	return out
}

func SeedGameSettingsIfEmpty(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.GameSetting{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	for _, item := range DefaultGameSettings() {
		if err := db.Create(&item).Error; err != nil {
			return err
		}
	}
	return nil
}
