package services

import (
	"errors"
	"sort"
	"sync"
	"tg-lobbies-base/internal/games/catalog"
	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

var (
	ErrGameDisabled    = errors.New("game is disabled")
	ErrGameNotFound    = errors.New("game not found")
	gameSettingsMu     sync.RWMutex
	cachedGameSettings map[string]models.GameSetting
)

func SeedGameSettingsIfEmpty(db *gorm.DB) error {
	if err := catalog.SeedGameSettingsIfEmpty(db); err != nil {
		return err
	}

	return ReloadGameSettingsCache(db)
}

func ReloadGameSettingsCache(db *gorm.DB) error {
	var rows []models.GameSetting

	if err := db.
		Order("sort_order ASC, code ASC").
		Find(&rows).
		Error; err != nil {
		return err
	}

	settings := make(
		map[string]models.GameSetting,
		len(rows),
	)

	for _, row := range rows {
		settings[row.Code] = row
	}

	gameSettingsMu.Lock()
	cachedGameSettings = settings
	gameSettingsMu.Unlock()

	return nil
}

func GetGameSetting(
	code string,
) (models.GameSetting, bool) {
	gameSettingsMu.RLock()
	defer gameSettingsMu.RUnlock()

	row, ok := cachedGameSettings[normalizeGameCode(code)]

	return row, ok
}

func ListGameSettings() []models.GameSetting {
	gameSettingsMu.RLock()
	defer gameSettingsMu.RUnlock()

	out := make(
		[]models.GameSetting,
		0,
		len(cachedGameSettings),
	)

	for _, row := range cachedGameSettings {
		out = append(out, row)
	}

	sort.Slice(
		out,
		func(i, j int) bool {
			if out[i].SortOrder == out[j].SortOrder {
				return out[i].Code < out[j].Code
			}

			return out[i].SortOrder < out[j].SortOrder
		},
	)

	return out
}

func IsGameEnabled(code string) bool {
	row, ok := GetGameSetting(code)

	return !ok || row.Enabled
}

func normalizeGameCode(code string) string {
	switch code {
	case "plinko-pvp":
		return "plinko_pvp"

	case "disc-football":
		return "disc_football"

	case "dunk-shot":
		return "dunk_shot"

	case "flappy-race":
		return "flappy_race"

	case "doodle-jump":
		return "doodle_jump"

	default:
		return code
	}
}

func IsPvpGameSupported(code string) bool {
	code = normalizeGameCode(code)

	if !catalog.IsKnownPvpGame(code) {
		return false
	}

	return IsGameEnabled(code)
}

func ListEnabledPvpGames() []catalog.PvpGame {
	out := make([]catalog.PvpGame, 0)

	for _, row := range ListGameSettings() {
		if row.Kind != "pvp" || !row.Enabled {
			continue
		}

		if !catalog.IsKnownPvpGame(row.Code) {
			continue
		}

		out = append(
			out,
			catalog.PvpGame{
				Code:        row.Code,
				DisplayName: row.Title,
				MinBet:      row.MinBet,
				MaxBet:      row.MaxBet,
			},
		)
	}

	return out
}

func GetSoloGameConfig(
	code string,
) (solo.GameConfig, error) {
	code = solo.NormalizeGame(code)

	base, err := solo.GetConfig(code)
	if err != nil {
		return solo.GameConfig{}, err
	}

	row, ok := GetGameSetting(code)

	if !ok {
		return base, nil
	}

	if !row.Enabled {
		return solo.GameConfig{}, ErrGameDisabled
	}

	base.Title = row.Title
	base.MinBet = row.MinBet
	base.MaxBet = row.MaxBet

	return base, nil
}

func ListEnabledSoloGames() []solo.GameConfig {
	out := make([]solo.GameConfig, 0)

	for _, row := range ListGameSettings() {
		if row.Kind != "solo" || !row.Enabled {
			continue
		}

		cfg, err := solo.GetConfig(row.Code)

		if err != nil {
			continue
		}

		cfg.Title = row.Title
		cfg.MinBet = row.MinBet
		cfg.MaxBet = row.MaxBet

		out = append(out, cfg)
	}

	sort.Slice(
		out,
		func(i, j int) bool {
			return out[i].Code < out[j].Code
		},
	)

	return out
}

func UpdateGameSetting(
	db *gorm.DB,
	code string,
	patch map[string]any,
) (*models.GameSetting, error) {
	code = normalizeGameCode(code)

	var row models.GameSetting

	if err := db.
		Where("code = ?", code).
		First(&row).
		Error; err != nil {
		return nil, ErrGameNotFound
	}

	if value, ok := patch["enabled"].(bool); ok {
		row.Enabled = value
	}

	if value, ok := patch["title"].(string); ok && value != "" {
		row.Title = value
	}

	if value, ok := patch["min_bet"].(float64); ok && value > 0 {
		if row.Kind == "pvp" && value < catalog.MinPvpBet {
			return nil, errors.New("pvp min_bet cannot be below 2")
		}
		row.MinBet = value
	}

	if value, ok := patch["max_bet"].(float64); ok && value > 0 {
		row.MaxBet = value
	}

	if value, ok := patch["maintenance_message"].(string); ok {
		row.MaintenanceMessage = value
	}

	if row.MinBet > row.MaxBet {
		return nil, errors.New(
			"min_bet cannot exceed max_bet",
		)
	}

	if err := db.Save(&row).Error; err != nil {
		return nil, err
	}

	if err := ReloadGameSettingsCache(db); err != nil {
		return nil, err
	}

	return &row, nil
}
