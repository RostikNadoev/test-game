package realtime

import "time"

const (
	LobbyStatusWaiting  = "waiting"
	LobbyStatusPlaying  = "playing"
	LobbyStatusFinished = "finished"
)

type GameInfo struct {
	Code        string `json:"code"`
	DisplayName string `json:"display_name"`
}

var SupportedGames = []GameInfo{
	{Code: "plinko_pvp", DisplayName: "Plinko PvP"},
	{Code: "descent_duel", DisplayName: "Descent Duel"},
	{Code: "paper_io", DisplayName: "Paper IO"},
	{Code: "tower_stack", DisplayName: "Tower Stack"},
	{Code: "crash_duel", DisplayName: "Crash Duel"},
	{Code: "virus_market", DisplayName: "Virus Market"},
	{Code: "rps_duel", DisplayName: "RPS Duel"},
	{Code: "grid_lock", DisplayName: "Grid Lock"},
	{Code: "blackjack_duel", DisplayName: "Blackjack Duel"},
	{Code: "dice_duel", DisplayName: "Dice Duel"},
	{Code: "neon_matrix", DisplayName: "Neon Matrix"},
	{Code: "street_race", DisplayName: "Street Race"},
	{Code: "air_hockey", DisplayName: "Air Hockey"},
}

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

type LobbyDTO struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Game        string    `json:"game"`
	Status      string    `json:"status"`
	BetCoins    float64   `json:"bet_coins"`
	MaxPlayers  int       `json:"max_players"`
	PlayerCount int       `json:"player_count"`
	Players     []uint    `json:"players"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
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
