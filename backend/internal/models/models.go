package models

import "time"

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
