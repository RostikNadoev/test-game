package services

import (
	"errors"
	"strings"
	"time"

	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

var (
	ErrUserBlocked      = errors.New("user is blocked")
	ErrUserNotFound     = errors.New("user not found")
	ErrInvalidCurrency  = errors.New("invalid currency")
	ErrNegativeBalance  = errors.New("insufficient balance for debit")
)

func IsUserBlocked(db *gorm.DB, userID uint) (bool, error) {
	var user models.User
	if err := db.Select("is_blocked").First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, ErrUserNotFound
		}
		return false, err
	}
	return user.IsBlocked, nil
}

func EnsureUserNotBlocked(db *gorm.DB, userID uint) error {
	blocked, err := IsUserBlocked(db, userID)
	if err != nil {
		return err
	}
	if blocked {
		return ErrUserBlocked
	}
	return nil
}

type AdminUserListItem struct {
	ID           uint      `json:"id"`
	TelegramID   int64     `json:"telegram_id"`
	TgUser       string    `json:"tg_user"`
	PhotoURL     string    `json:"photo_url"`
	BalanceTON   float64   `json:"balance_ton"`
	BalanceGame  float64   `json:"balance_game"`
	IsBlocked    bool      `json:"is_blocked"`
	BlockedReason string   `json:"blocked_reason,omitempty"`
	Rating       int       `json:"rating"`
	CreatedAt    time.Time `json:"created_at"`
}

func ListUsersAdmin(db *gorm.DB, query string, blockedFilter string, limit, offset int) ([]AdminUserListItem, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	q := db.Model(&models.User{}).Preload("Stats")
	query = strings.TrimSpace(query)
	if query != "" {
		like := "%" + strings.ToLower(query) + "%"
		q = q.Where(
			"LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? OR CAST(telegram_id AS TEXT) LIKE ? OR CAST(id AS TEXT) LIKE ?",
			like, like, "%"+query+"%", "%"+query+"%",
		)
	}
	switch blockedFilter {
	case "blocked":
		q = q.Where("is_blocked = ?", true)
	case "active":
		q = q.Where("is_blocked = ?", false)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []models.User
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&users).Error; err != nil {
		return nil, 0, err
	}
	out := make([]AdminUserListItem, 0, len(users))
	for _, u := range users {
		out = append(out, AdminUserListItem{
			ID:            u.ID,
			TelegramID:    u.TelegramID,
			TgUser:        UserDisplayLabel(&u),
			PhotoURL:      u.PhotoURL,
			BalanceTON:    u.BalanceTON,
			BalanceGame:   u.BalanceGame,
			IsBlocked:     u.IsBlocked,
			BlockedReason: u.BlockedReason,
			Rating:        u.Stats.Rating,
			CreatedAt:     u.CreatedAt,
		})
	}
	return out, total, nil
}

func BlockUser(db *gorm.DB, userID uint, reason, adminUsername string) (*models.User, error) {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	now := time.Now().UTC()
	user.IsBlocked = true
	user.BlockedReason = strings.TrimSpace(reason)
	user.BlockedAt = &now
	user.BlockedByAdmin = adminUsername
	if err := db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func UnblockUser(db *gorm.DB, userID uint) (*models.User, error) {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	user.IsBlocked = false
	user.BlockedReason = ""
	user.BlockedAt = nil
	user.BlockedByAdmin = ""
	if err := db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

type AdminDashboardStats struct {
	TotalUsers         int64   `json:"total_users"`
	BlockedUsers       int64   `json:"blocked_users"`
	TotalBalanceGame   float64 `json:"total_balance_game"`
	TotalBalanceTON    float64 `json:"total_balance_ton"`
	ActiveSoloSessions int64   `json:"active_solo_sessions"`
	ActiveLobbies      int64   `json:"active_lobbies"`
	PlayingMatches     int64   `json:"playing_matches"`
	NewUsersToday      int64   `json:"new_users_today"`
}

func GetAdminDashboardStats(db *gorm.DB, activeLobbies int) (*AdminDashboardStats, error) {
	stats := &AdminDashboardStats{ActiveLobbies: int64(activeLobbies)}
	if err := db.Model(&models.User{}).Count(&stats.TotalUsers).Error; err != nil {
		return nil, err
	}
	if err := db.Model(&models.User{}).Where("is_blocked = ?", true).Count(&stats.BlockedUsers).Error; err != nil {
		return nil, err
	}
	type sumRow struct {
		Game float64
		TON  float64
	}
	var sums sumRow
	if err := db.Model(&models.User{}).Select("COALESCE(SUM(balance_game),0) as game, COALESCE(SUM(balance_ton),0) as ton").Scan(&sums).Error; err != nil {
		return nil, err
	}
	stats.TotalBalanceGame = sums.Game
	stats.TotalBalanceTON = sums.TON
	if err := db.Model(&models.SoloSession{}).Where("status = ?", models.SoloSessionStatusActive).Count(&stats.ActiveSoloSessions).Error; err != nil {
		return nil, err
	}
	if err := db.Model(&models.Match{}).Where("status = ?", models.MatchStatusPlaying).Count(&stats.PlayingMatches).Error; err != nil {
		return nil, err
	}
	start := time.Now().UTC().Truncate(24 * time.Hour)
	if err := db.Model(&models.User{}).Where("created_at >= ?", start).Count(&stats.NewUsersToday).Error; err != nil {
		return nil, err
	}
	return stats, nil
}

func AdminAbandonSoloSession(db *gorm.DB, sessionID string) (*SoloSessionResult, error) {
	var session models.SoloSession
	if err := db.Where("id = ?", sessionID).First(&session).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSoloSessionNotFound
		}
		return nil, err
	}
	if session.Status != models.SoloSessionStatusActive {
		return nil, ErrSoloSessionNotActive
	}
	return AbandonSoloSession(db, session.UserID, sessionID)
}
