package solo

import (
	"errors"
	"sort"
)

const (
	ModeInstant  = "instant"
	ModeSession  = "session"
	MinBetGlobal = 1.0
	MaxBetGlobal = 500.0
)

var (
	ErrUnsupportedGame = errors.New("unsupported solo game")
	ErrInvalidBet      = errors.New("invalid bet amount")
	ErrInvalidAction   = errors.New("invalid session action")
	ErrSessionNotFound = errors.New("solo session not found")
	ErrSessionNotActive = errors.New("solo session is not active")
	ErrActiveSessionExists = errors.New("active solo session already exists")
)

type GameConfig struct {
	Code    string  `json:"code"`
	Title   string  `json:"title"`
	Mode    string  `json:"mode"`
	MinBet  float64 `json:"min_bet"`
	MaxBet  float64 `json:"max_bet"`
}

var catalog = map[string]GameConfig{
	"neon_scratch":  {Code: "neon_scratch", Title: "Lucky Scratch", Mode: ModeInstant, MinBet: 1, MaxBet: 500},
	"fruit_cascade": {Code: "fruit_cascade", Title: "Fruit Cascade", Mode: ModeInstant, MinBet: 1, MaxBet: 500},
	"royal_5x5":     {Code: "royal_5x5", Title: "Apple Trail", Mode: ModeSession, MinBet: 1, MaxBet: 500},
	"crystal_mines": {Code: "crystal_mines", Title: "Crystal Mines", Mode: ModeSession, MinBet: 1, MaxBet: 500},
	"turbo_tower":   {Code: "turbo_tower", Title: "Turbo Tower", Mode: ModeSession, MinBet: 1, MaxBet: 500},
}

func NormalizeGame(code string) string {
	switch code {
	case "neon-scratch":
		return "neon_scratch"
	case "fruit-cascade":
		return "fruit_cascade"
	case "royal-5x5":
		return "royal_5x5"
	case "crystal-mines":
		return "crystal_mines"
	case "turbo-tower":
		return "turbo_tower"
	default:
		return code
	}
}

func GetConfig(code string) (GameConfig, error) {
	cfg, ok := catalog[NormalizeGame(code)]
	if !ok {
		return GameConfig{}, ErrUnsupportedGame
	}
	return cfg, nil
}

func ListGames() []GameConfig {
	out := make([]GameConfig, 0, len(catalog))
	for _, item := range catalog {
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Code < out[j].Code
	})
	return out
}

func ValidateBet(code string, bet float64) error {
	cfg, err := GetConfig(code)
	if err != nil {
		return err
	}
	if bet < cfg.MinBet-1e-9 || bet > cfg.MaxBet+1e-9 {
		return ErrInvalidBet
	}
	return nil
}

func IsInstant(code string) bool {
	cfg, err := GetConfig(code)
	return err == nil && cfg.Mode == ModeInstant
}

func IsSession(code string) bool {
	cfg, err := GetConfig(code)
	return err == nil && cfg.Mode == ModeSession
}
