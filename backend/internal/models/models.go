package models

import "time"

const (
	MatchStatusPlaying  = "playing"
	MatchStatusFinished = "finished"

	BetStatusReserved = "reserved"
	BetStatusRefunded = "refunded"
	BetStatusSettled  = "settled"
)

type User struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	TelegramID  int64  `gorm:"uniqueIndex;not null" json:"telegram_id"`
	Username    string `gorm:"index" json:"username"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	DisplayName string `json:"display_name"`
	PhotoURL    string `json:"photo_url"`

	BalanceTON  float64 `gorm:"not null;default:0" json:"balance_ton"`
	BalanceGame float64 `gorm:"not null;default:0" json:"balance_game"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Stats     UserStats `gorm:"constraint:OnDelete:CASCADE" json:"stats"`
}

type UserStats struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	Rating       int       `gorm:"not null;default:1000" json:"rating"`
	Wins         int       `gorm:"not null;default:0" json:"wins"`
	Losses       int       `gorm:"not null;default:0" json:"losses"`
	FavoriteMode string    `gorm:"not null;default:'none'" json:"favorite_mode"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (s UserStats) TotalGames() int {
	return s.Wins + s.Losses
}

func (s UserStats) WinRate() float64 {
	total := s.TotalGames()
	if total == 0 {
		return 0
	}
	return float64(s.Wins) / float64(total) * 100
}

type WalletTransaction struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	Type      string    `gorm:"index;not null" json:"type"`
	Currency  string    `gorm:"index;not null" json:"currency"`
	Amount    float64   `gorm:"not null" json:"amount"`
	Status    string    `gorm:"index;not null;default:'completed'" json:"status"`
	Meta      string    `gorm:"type:jsonb;default:'{}'" json:"meta"`
	CreatedAt time.Time `json:"created_at"`
}

type BetReservation struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	LobbyID   string    `gorm:"index;not null;uniqueIndex:idx_bet_lobby_user" json:"lobby_id"`
	UserID    uint      `gorm:"index;not null;uniqueIndex:idx_bet_lobby_user" json:"user_id"`
	Amount    float64   `gorm:"not null" json:"amount"`
	Status    string    `gorm:"index;not null;default:'reserved'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Match struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	LobbyID      string     `gorm:"uniqueIndex;not null" json:"lobby_id"`
	Game         string     `gorm:"index;not null" json:"game"`
	BetCoins     float64    `gorm:"not null" json:"bet_coins"`
	Player1ID    uint       `gorm:"index;not null" json:"player1_id"`
	Player2ID    uint       `gorm:"index;not null" json:"player2_id"`
	WinnerUserID *uint      `gorm:"index" json:"winner_user_id,omitempty"`
	Status       string     `gorm:"index;not null;default:'playing'" json:"status"`
	SettledAt    *time.Time `json:"settled_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type LobbyRecord struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	Name       string    `gorm:"not null" json:"name"`
	Game       string    `gorm:"index;not null" json:"game"`
	Status     string    `gorm:"index;not null" json:"status"`
	BetCoins   float64   `gorm:"not null" json:"bet_coins"`
	MaxPlayers int       `gorm:"not null;default:2" json:"max_players"`
	CreatedBy  uint      `gorm:"index;not null" json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type LobbyPlayerRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	LobbyID   string    `gorm:"index;not null;uniqueIndex:idx_lobby_player" json:"lobby_id"`
	UserID    uint      `gorm:"index;not null;uniqueIndex:idx_lobby_player" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}
