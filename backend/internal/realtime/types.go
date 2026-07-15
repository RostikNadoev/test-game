package realtime

import (
	"time"
	"tg-lobbies-base/internal/games/catalog"
)

const (
	LobbyStatusWaiting  = "waiting"
	LobbyStatusPlaying  = "playing"
	LobbyStatusFinished = "finished"
)

type GameInfo struct {
	Code        string `json:"code"`
	DisplayName string `json:"display_name"`
}

var SupportedGames = func() []GameInfo {
	out := make([]GameInfo, len(catalog.PvpGames))
	for i, g := range catalog.PvpGames {
		out[i] = GameInfo{Code: g.Code, DisplayName: g.DisplayName}
	}
	return out
}()

const LobbyMaxPlayers = 2

type Lobby struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	Game       string        `json:"game"`
	Status     string        `json:"status"`
	BetCoins   float64       `json:"bet_coins"`
	MaxPlayers int           `json:"max_players"`
	Players    map[uint]bool `json:"-"`
	CreatedBy  uint          `json:"created_by"`
	CreatedAt  time.Time     `json:"created_at"`
	UpdatedAt  time.Time     `json:"updated_at"`
}

type PlayerInfo struct {
	ID       uint   `json:"id"`
	TgUser   string `json:"tg_user"`
	PhotoURL string `json:"photo_url"`
}

type LobbyDTO struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Game         string       `json:"game"`
	Status       string       `json:"status"`
	BetCoins     float64      `json:"bet_coins"`
	MaxPlayers   int          `json:"max_players"`
	PlayerCount  int          `json:"player_count"`
	Players      []uint       `json:"players"`
	PlayersInfo  []PlayerInfo `json:"players_info,omitempty"`
	CreatedBy    uint         `json:"created_by"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

func (l *Lobby) DTO() LobbyDTO {
	players := make([]uint, 0, len(l.Players))
	for id := range l.Players {
		players = append(players, id)
	}
	return LobbyDTO{
		ID:          l.ID,
		Name:        l.Name,
		Game:        l.Game,
		Status:      l.Status,
		BetCoins:    l.BetCoins,
		MaxPlayers:  l.MaxPlayers,
		PlayerCount: len(l.Players),
		Players:     players,
		CreatedBy:   l.CreatedBy,
		CreatedAt:   l.CreatedAt,
		UpdatedAt:   l.UpdatedAt,
	}
}
