package catalog

import (
	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func DefaultGameSettings() []models.GameSetting {
	out := make([]models.GameSetting, 0, len(PvpGames)+8)
	order := 0

	for _, game := range PvpGames {
		out = append(out, models.GameSetting{
			Code:      game.Code,
			Kind:      "pvp",
			Enabled:   true,
			Title:     game.DisplayName,
			MinBet:    1,
			MaxBet:    500,
			SortOrder: order,
		})

		order++
	}

	for _, game := range solo.ListGames() {
		out = append(out, models.GameSetting{
			Code:      game.Code,
			Kind:      "solo",
			Enabled:   true,
			Title:     game.Title,
			MinBet:    game.MinBet,
			MaxBet:    game.MaxBet,
			SortOrder: order,
		})

		order++
	}

	return out
}

func SeedGameSettingsIfEmpty(db *gorm.DB) error {
	if db == nil {
		return nil
	}

	for _, item := range DefaultGameSettings() {
		if err := db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "code"},
			},
			DoNothing: true,
		}).Create(&item).Error; err != nil {
			return err
		}
	}

	return nil
}