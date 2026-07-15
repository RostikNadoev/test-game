package handlers

import (
	"strings"
	"tg-lobbies-base/internal/models"
)

func telegramUserLabel(user *models.User) string {
	username := strings.TrimSpace(user.Username)
	if username != "" {
		return "@" + strings.TrimPrefix(username, "@")
	}

	name := strings.TrimSpace(strings.TrimSpace(user.FirstName) + " " + strings.TrimSpace(user.LastName))
	if name != "" {
		return name
	}

	return "Telegram User"
}

func userDTO(user *models.User) map[string]any {
	stats := user.Stats
	return map[string]any{
		"id":           user.ID,
		"telegram_id":  user.TelegramID,
		"tg_user":      telegramUserLabel(user),
		"photo_url":    user.PhotoURL,
		"balance_ton":  user.BalanceTON,
		"balance_game": user.BalanceGame,
		"stats": map[string]any{
			"rating":        stats.Rating,
			"wins":          stats.Wins,
			"losses":        stats.Losses,
			"total_games":   stats.TotalGames(),
			"winrate":       stats.WinRate(),
			"favorite_mode": stats.FavoriteMode,
		},
		"created_at": user.CreatedAt,
	}
}
