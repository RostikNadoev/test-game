package services

import (
	"time"

	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

type AdminUserDetail struct {
	User            models.User              `json:"user"`
	Stats           models.UserStats         `json:"stats"`
	SoloStats       models.UserSoloStats     `json:"solo_stats"`
	RecentWalletTx  []models.WalletTransaction `json:"recent_wallet_tx"`
	RecentSoloRounds []models.SoloRound      `json:"recent_solo_rounds"`
	RecentSoloSessions []models.SoloSession  `json:"recent_solo_sessions"`
	RecentMatches   []models.Match           `json:"recent_matches"`
}

func GetAdminUserDetail(db *gorm.DB, userID uint) (*AdminUserDetail, error) {
	var user models.User
	if err := db.Preload("Stats").First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}

	var soloStats models.UserSoloStats
	_ = db.Where("user_id = ?", userID).First(&soloStats).Error

	detail := &AdminUserDetail{
		User:      user,
		Stats:     user.Stats,
		SoloStats: soloStats,
	}

	_ = db.Where("user_id = ?", userID).Order("created_at DESC").Limit(25).Find(&detail.RecentWalletTx).Error
	_ = db.Where("user_id = ?", userID).Order("created_at DESC").Limit(25).Find(&detail.RecentSoloRounds).Error
	_ = db.Where("user_id = ?", userID).Order("created_at DESC").Limit(25).Find(&detail.RecentSoloSessions).Error
	_ = db.Where("player1_id = ? OR player2_id = ?", userID, userID).Order("created_at DESC").Limit(25).Find(&detail.RecentMatches).Error

	return detail, nil
}

type AdminSoloSessionItem struct {
	ID        string    `json:"id"`
	UserID    uint      `json:"user_id"`
	TgUser    string    `json:"tg_user"`
	Game      string    `json:"game"`
	BetCoins  float64   `json:"bet_coins"`
	Status    string    `json:"status"`
	Multiplier float64  `json:"multiplier"`
	CreatedAt time.Time `json:"created_at"`
}

type AdminLobbyPlayer struct {
	UserID uint   `json:"user_id"`
	TgUser string `json:"tg_user"`
}

type AdminLobbySessionItem struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Game        string             `json:"game"`
	Status      string             `json:"status"`
	BetCoins    float64            `json:"bet_coins"`
	PlayerCount int                `json:"player_count"`
	Players     []AdminLobbyPlayer `json:"players,omitempty"`
	CreatedAt   time.Time          `json:"created_at"`
}

type AdminMatchSessionItem struct {
	ID           uint      `json:"id"`
	LobbyID      string    `json:"lobby_id"`
	Game         string    `json:"game"`
	Status       string    `json:"status"`
	BetCoins     float64   `json:"bet_coins"`
	Player1ID    uint      `json:"player1_id"`
	Player2ID    uint      `json:"player2_id"`
	WinnerUserID *uint     `json:"winner_user_id,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type AdminSessionsResponse struct {
	SoloSessions []AdminSoloSessionItem  `json:"solo_sessions"`
	Lobbies      []AdminLobbySessionItem `json:"lobbies"`
	Matches      []AdminMatchSessionItem `json:"matches"`
}

func ListAdminSessions(db *gorm.DB, lobbies []AdminLobbySessionItem) (*AdminSessionsResponse, error) {
	resp := &AdminSessionsResponse{
		SoloSessions: []AdminSoloSessionItem{},
		Lobbies:      lobbies,
		Matches:      []AdminMatchSessionItem{},
	}
	if resp.Lobbies == nil {
		resp.Lobbies = []AdminLobbySessionItem{}
	}

	var soloSessions []models.SoloSession
	if err := db.Where("status = ?", models.SoloSessionStatusActive).Order("created_at DESC").Limit(100).Find(&soloSessions).Error; err != nil {
		return nil, err
	}
	userCache := map[uint]string{}
	for _, s := range soloSessions {
		label, ok := userCache[s.UserID]
		if !ok {
			var user models.User
			if err := db.Select("id", "username", "display_name", "first_name", "last_name").First(&user, s.UserID).Error; err == nil {
				label = UserDisplayLabel(&user)
			}
			userCache[s.UserID] = label
		}
		resp.SoloSessions = append(resp.SoloSessions, AdminSoloSessionItem{
			ID:         s.ID,
			UserID:     s.UserID,
			TgUser:     label,
			Game:       s.Game,
			BetCoins:   s.BetCoins,
			Status:     s.Status,
			Multiplier: s.CurrentMultiplier,
			CreatedAt:  s.CreatedAt,
		})
	}

	var matches []models.Match
	if err := db.Where("status = ?", models.MatchStatusPlaying).Order("created_at DESC").Limit(100).Find(&matches).Error; err != nil {
		return nil, err
	}
	for _, m := range matches {
		resp.Matches = append(resp.Matches, AdminMatchSessionItem{
			ID:           m.ID,
			LobbyID:      m.LobbyID,
			Game:         m.Game,
			Status:       m.Status,
			BetCoins:     m.BetCoins,
			Player1ID:    m.Player1ID,
			Player2ID:    m.Player2ID,
			WinnerUserID: m.WinnerUserID,
			CreatedAt:    m.CreatedAt,
		})
	}

	return resp, nil
}

func ListRecentWalletTransactions(db *gorm.DB, limit int) ([]models.WalletTransaction, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var rows []models.WalletTransaction
	if err := db.Order("created_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
