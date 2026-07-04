package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
)

type Hub struct {
	mu      sync.RWMutex
	lobbies map[string]*Lobby
}

func NewHub() *Hub {
	return &Hub{
		lobbies: make(map[string]*Lobby),
	}
}

func (h *Hub) Snapshot() []LobbyDTO {
	return h.snapshot(false, "")
}

func (h *Hub) ActiveSnapshot(game string) []LobbyDTO {
	return h.snapshot(true, game)
}

func (h *Hub) snapshot(activeOnly bool, game string) []LobbyDTO {
	h.mu.RLock()
	defer h.mu.RUnlock()

	game = NormalizeGameCode(game)
	out := make([]LobbyDTO, 0, len(h.lobbies))
	for _, lobby := range h.lobbies {
		if activeOnly && !isActiveLobby(lobby) {
			continue
		}
		if game != "" && normalizeKey(lobby.Game) != game {
			continue
		}
		out = append(out, lobby.DTO())
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].UpdatedAt.After(out[j].UpdatedAt)
	})
	return out
}

func (h *Hub) GetLobby(lobbyID string) (*Lobby, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	lobby, ok := h.lobbies[strings.TrimSpace(lobbyID)]
	if !ok {
		return nil, errors.New("lobby not found")
	}
	return cloneLobby(lobby), nil
}

func (h *Hub) CreateLobby(userID uint, name string, game string, betCoins float64) (*Lobby, error) {
	name = strings.TrimSpace(name)
	game = NormalizeGameCode(game)

	if userID == 0 {
		return nil, errors.New("bad user")
	}
	if name == "" {
		return nil, errors.New("name is required")
	}
	if game == "" {
		return nil, errors.New("game is required")
	}
	if !IsSupportedGame(game) {
		return nil, errors.New("unsupported game")
	}
	if betCoins <= 0 {
		return nil, errors.New("bet_coins must be greater than 0")
	}

	now := time.Now().UTC()
	lobby := &Lobby{
		ID:         randomID(),
		Name:       name,
		Game:       game,
		Status:     LobbyStatusWaiting,
		BetCoins:   betCoins,
		MaxPlayers: LobbyMaxPlayers,
		Players:    map[uint]bool{userID: true},
		CreatedBy:  userID,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if h.userInActiveLobbyLocked(userID) {
		return nil, errors.New("user already has active lobby")
	}

	h.lobbies[lobby.ID] = lobby
	return cloneLobby(lobby), nil
}

func (h *Hub) JoinLobby(userID uint, lobbyID string) (*Lobby, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if userID == 0 {
		return nil, errors.New("bad user")
	}
	if h.userInActiveLobbyLocked(userID) {
		return nil, errors.New("user already has active lobby")
	}

	lobby, ok := h.lobbies[strings.TrimSpace(lobbyID)]
	if !ok {
		return nil, errors.New("lobby not found")
	}
	if lobby.Status != LobbyStatusWaiting {
		return nil, errors.New("lobby is not waiting")
	}
	if lobby.CreatedBy == userID {
		return nil, errors.New("creator is already in lobby")
	}
	if len(lobby.Players) >= lobby.MaxPlayers {
		return nil, errors.New("lobby is full")
	}

	lobby.Players[userID] = true
	if len(lobby.Players) >= lobby.MaxPlayers {
		lobby.Status = LobbyStatusPlaying
	}
	lobby.UpdatedAt = time.Now().UTC()
	return cloneLobby(lobby), nil
}

func (h *Hub) LeaveLobby(userID uint, lobbyID string) (*Lobby, bool, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if userID == 0 {
		return nil, false, errors.New("bad user")
	}

	lobby, ok := h.lobbies[strings.TrimSpace(lobbyID)]
	if !ok {
		return nil, false, errors.New("lobby not found")
	}
	if !lobby.Players[userID] {
		return nil, false, errors.New("user is not in lobby")
	}

	delete(lobby.Players, userID)
	if len(lobby.Players) == 0 {
		delete(h.lobbies, lobby.ID)
		return nil, true, nil
	}

	if len(lobby.Players) < lobby.MaxPlayers && lobby.Status != LobbyStatusFinished {
		lobby.Status = LobbyStatusWaiting
	}
	lobby.UpdatedAt = time.Now().UTC()
	return cloneLobby(lobby), false, nil
}

func (h *Hub) userInActiveLobbyLocked(userID uint) bool {
	for _, lobby := range h.lobbies {
		if !isActiveLobby(lobby) {
			continue
		}
		if lobby.Players[userID] {
			return true
		}
	}
	return false
}

func cloneLobby(src *Lobby) *Lobby {
	if src == nil {
		return nil
	}
	players := make(map[uint]bool, len(src.Players))
	for id, ok := range src.Players {
		players[id] = ok
	}
	cp := *src
	cp.Players = players
	return &cp
}

func isActiveLobby(lobby *Lobby) bool {
	if lobby == nil {
		return false
	}
	return lobby.Status == LobbyStatusWaiting || lobby.Status == LobbyStatusPlaying
}

func normalizeKey(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ToLower(value)
	value = strings.ReplaceAll(value, "-", "_")
	value = strings.ReplaceAll(value, " ", "_")
	return value
}

func NormalizeGameCode(value string) string {
	value = normalizeKey(value)
	switch value {
	case "plinko-pvp":
		return "plinko_pvp"
	case "descent-duel":
		return "descent_duel"
	case "paper-io":
		return "paper_io"
	case "tower-stack":
		return "tower_stack"
	case "crash-duel":
		return "crash_duel"
	case "virus-market":
		return "virus_market"
	case "rps-duel":
		return "rps_duel"
	case "grid-lock":
		return "grid_lock"
	case "blackjack-duel":
		return "blackjack_duel"
	case "dice-duel":
		return "dice_duel"
	case "neon-matrix":
		return "neon_matrix"
	case "street-race", "strett_race", "strett-race":
		return "street_race"
	case "air-hockey":
		return "air_hockey"
	default:
		return value
	}
}

func IsSupportedGame(game string) bool {
	game = NormalizeGameCode(game)
	for _, item := range SupportedGames {
		if item.Code == game {
			return true
		}
	}
	return false
}

func Games() []GameInfo {
	out := make([]GameInfo, len(SupportedGames))
	copy(out, SupportedGames)
	return out
}

func randomID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return strings.ReplaceAll(time.Now().Format("20060102150405.000000000"), ".", "")
	}
	return hex.EncodeToString(b)
}

func (h *Hub) FinishLobby(lobbyID string) (*Lobby, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	lobby, ok := h.lobbies[strings.TrimSpace(lobbyID)]
	if !ok {
		return nil, errors.New("lobby not found")
	}

	lobby.Status = LobbyStatusFinished
	lobby.UpdatedAt = time.Now().UTC()

	return cloneLobby(lobby), nil
}
