package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"tg-lobbies-base/internal/services"

	"gorm.io/gorm"
)

type Hub struct {
	mu      sync.RWMutex
	lobbies map[string]*Lobby
	db      *gorm.DB
}

type lobbySnapshot struct {
	status    string
	updatedAt time.Time
	players   map[uint]bool
}

var createMatchFn = services.CreateMatch

func snapshotLobby(lobby *Lobby) lobbySnapshot {
	players := make(map[uint]bool, len(lobby.Players))
	for id, ok := range lobby.Players {
		players[id] = ok
	}
	return lobbySnapshot{
		status:    lobby.Status,
		updatedAt: lobby.UpdatedAt,
		players:   players,
	}
}

func restoreLobby(lobby *Lobby, snap lobbySnapshot) {
	lobby.Status = snap.status
	lobby.UpdatedAt = snap.updatedAt
	lobby.Players = make(map[uint]bool, len(snap.players))
	for id, ok := range snap.players {
		lobby.Players[id] = ok
	}
}

func NewHub(db *gorm.DB) *Hub {
	h := &Hub{
		lobbies: make(map[string]*Lobby),
		db:      db,
	}

	if db != nil {
		lobbies, err := loadActiveLobbies(db)
		if err != nil {
			log.Printf("failed to load active lobbies: %v", err)
		} else {
			for _, lobby := range lobbies {
				h.lobbies[lobby.ID] = lobby
			}
		}
	}

	go h.cleanupLoop()
	return h
}

func (h *Hub) DB() *gorm.DB {
	return h.db
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
		out = append(out, h.buildDTOLocked(lobby))
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

func (h *Hub) GetLobbyDTO(lobbyID string) (LobbyDTO, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	lobby, ok := h.lobbies[strings.TrimSpace(lobbyID)]
	if !ok {
		return LobbyDTO{}, errors.New("lobby not found")
	}
	return h.buildDTOLocked(lobby), nil
}

func (h *Hub) BuildDTO(lobby *Lobby) LobbyDTO {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.buildDTOLocked(lobby)
}

func (h *Hub) buildDTOLocked(lobby *Lobby) LobbyDTO {
	dto := lobby.DTO()
	dto.PlayersInfo = h.playersInfoLocked(lobby)
	return dto
}

func (h *Hub) playersInfoLocked(lobby *Lobby) []PlayerInfo {
	if h.db == nil || lobby == nil || len(lobby.Players) == 0 {
		return nil
	}

	ids := make([]uint, 0, len(lobby.Players))
	for id := range lobby.Players {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	users, err := services.GetUsersByIDs(h.db, ids)
	if err != nil {
		return nil
	}

	out := make([]PlayerInfo, 0, len(ids))
	for _, id := range ids {
		user, ok := users[id]
		if !ok {
			out = append(out, PlayerInfo{ID: id, TgUser: "Player #" + strconv.FormatUint(uint64(id), 10)})
			continue
		}
		out = append(out, PlayerInfo{
			ID:       id,
			TgUser:   services.UserDisplayLabel(&user),
			PhotoURL: user.PhotoURL,
		})
	}

	return out
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
	lobbyID := randomID()

	if h.db != nil {
		if err := services.ReserveBet(h.db, userID, lobbyID, betCoins); err != nil {
			if errors.Is(err, services.ErrInsufficientBalance) {
				return nil, errors.New("insufficient balance")
			}
			return nil, err
		}
	}

	lobby := &Lobby{
		ID:         lobbyID,
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
		if h.db != nil {
			if err := services.RefundBet(h.db, userID, lobbyID); err != nil {
				return nil, fmt.Errorf("refund bet after active lobby conflict: %w", err)
			}
		}
		return nil, errors.New("user already has active lobby")
	}

	h.lobbies[lobby.ID] = lobby
	if h.db != nil {
		if err := saveLobbyRecord(h.db, lobby); err != nil {
			delete(h.lobbies, lobby.ID)
			if refundErr := services.RefundBet(h.db, userID, lobbyID); refundErr != nil {
				return nil, fmt.Errorf("save lobby failed (%v) and refund failed: %w", err, refundErr)
			}
			return nil, fmt.Errorf("save lobby record: %w", err)
		}
		if err := saveLobbyPlayer(h.db, lobby.ID, userID); err != nil {
			delete(h.lobbies, lobby.ID)
			_ = deleteLobbyRecord(h.db, lobby.ID)
			if refundErr := services.RefundBet(h.db, userID, lobbyID); refundErr != nil {
				return nil, fmt.Errorf("save lobby player failed (%v) and refund failed: %w", err, refundErr)
			}
			return nil, fmt.Errorf("save lobby player: %w", err)
		}
	}

	return cloneLobby(lobby), nil
}

func (h *Hub) JoinLobby(userID uint, lobbyID string) (*Lobby, error) {
	lobbyID = strings.TrimSpace(lobbyID)

	h.mu.Lock()
	defer h.mu.Unlock()

	if userID == 0 {
		return nil, errors.New("bad user")
	}
	if h.userInActiveLobbyLocked(userID) {
		return nil, errors.New("user already has active lobby")
	}

	lobby, ok := h.lobbies[lobbyID]
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

	snap := snapshotLobby(lobby)

	if h.db != nil {
		if err := services.ReserveBet(h.db, userID, lobbyID, lobby.BetCoins); err != nil {
			if errors.Is(err, services.ErrInsufficientBalance) {
				return nil, errors.New("insufficient balance")
			}
			return nil, err
		}
	}

	lobby.Players[userID] = true
	startedMatch := len(lobby.Players) >= lobby.MaxPlayers
	if startedMatch {
		lobby.Status = LobbyStatusPlaying
	}
	lobby.UpdatedAt = time.Now().UTC()

	if h.db != nil {
		if err := saveLobbyPlayer(h.db, lobby.ID, userID); err != nil {
			restoreLobby(lobby, snap)
			if refundErr := services.RefundBet(h.db, userID, lobbyID); refundErr != nil {
				return nil, fmt.Errorf("save lobby player failed (%v) and refund failed: %w", err, refundErr)
			}
			return nil, fmt.Errorf("save lobby player: %w", err)
		}
		if err := saveLobbyRecord(h.db, lobby); err != nil {
			_ = deleteLobbyPlayer(h.db, lobby.ID, userID)
			restoreLobby(lobby, snap)
			if refundErr := services.RefundBet(h.db, userID, lobbyID); refundErr != nil {
				return nil, fmt.Errorf("save lobby record failed (%v) and refund failed: %w", err, refundErr)
			}
			return nil, fmt.Errorf("save lobby record: %w", err)
		}

		if startedMatch {
			playerIDs := make([]uint, 0, len(lobby.Players))
			for id := range lobby.Players {
				playerIDs = append(playerIDs, id)
			}
			if _, err := createMatchFn(h.db, lobby.ID, lobby.Game, lobby.BetCoins, playerIDs); err != nil {
				_ = deleteLobbyPlayer(h.db, lobby.ID, userID)
				restoreLobby(lobby, snap)
				if saveErr := saveLobbyRecord(h.db, lobby); saveErr != nil {
					return nil, fmt.Errorf("create match failed (%v) and rollback save failed: %w", err, saveErr)
				}
				if refundErr := services.RefundBet(h.db, userID, lobbyID); refundErr != nil {
					return nil, fmt.Errorf("create match failed (%v) and refund failed: %w", err, refundErr)
				}
				return nil, fmt.Errorf("create match: %w", err)
			}
		}
	}

	return cloneLobby(lobby), nil
}

func (h *Hub) LeaveLobby(userID uint, lobbyID string) (*Lobby, bool, error) {
	lobbyID = strings.TrimSpace(lobbyID)

	h.mu.Lock()
	defer h.mu.Unlock()

	if userID == 0 {
		return nil, false, errors.New("bad user")
	}

	lobby, ok := h.lobbies[lobbyID]
	if !ok {
		return nil, false, errors.New("lobby not found")
	}
	if !lobby.Players[userID] {
		return nil, false, errors.New("user is not in lobby")
	}
	if lobby.Status == LobbyStatusPlaying {
		return nil, false, errors.New("cannot leave lobby while match is in progress")
	}

	snap := snapshotLobby(lobby)

	if h.db != nil {
		if err := services.RefundBet(h.db, userID, lobbyID); err != nil {
			return nil, false, fmt.Errorf("refund bet: %w", err)
		}
	}

	delete(lobby.Players, userID)
	lobbyEmpty := len(lobby.Players) == 0
	if !lobbyEmpty && len(lobby.Players) < lobby.MaxPlayers && lobby.Status != LobbyStatusFinished {
		lobby.Status = LobbyStatusWaiting
	}
	lobby.UpdatedAt = time.Now().UTC()

	if h.db != nil {
		if lobbyEmpty {
			if err := deleteLobbyRecord(h.db, lobby.ID); err != nil {
				restoreLobby(lobby, snap)
				return nil, false, fmt.Errorf("delete lobby record: %w", err)
			}
			delete(h.lobbies, lobby.ID)
			return nil, true, nil
		}

		if err := deleteLobbyPlayer(h.db, lobby.ID, userID); err != nil {
			restoreLobby(lobby, snap)
			return nil, false, fmt.Errorf("delete lobby player: %w", err)
		}
		if err := saveLobbyRecord(h.db, lobby); err != nil {
			restoreLobby(lobby, snap)
			return nil, false, fmt.Errorf("save lobby record: %w", err)
		}
	}

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

	finishedAt := time.Now().UTC()

	if h.db != nil {
		persisted := cloneLobby(lobby)
		persisted.Status = LobbyStatusFinished
		persisted.UpdatedAt = finishedAt
		if err := saveLobbyRecordFn(h.db, persisted); err != nil {
			return nil, fmt.Errorf("save lobby record: %w", err)
		}
	}

	lobby.Status = LobbyStatusFinished
	lobby.UpdatedAt = finishedAt

	return cloneLobby(lobby), nil
}

func (h *Hub) cleanupLoop() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		h.cleanupFinished()
	}
}

func (h *Hub) cleanupFinished() {
	cutoff := time.Now().UTC().Add(-1 * time.Hour)

	h.mu.Lock()
	defer h.mu.Unlock()

	for id, lobby := range h.lobbies {
		if lobby.Status != LobbyStatusFinished {
			continue
		}
		if lobby.UpdatedAt.After(cutoff) {
			continue
		}
		snap := cloneLobby(lobby)
		delete(h.lobbies, id)
		if h.db != nil {
			if err := deleteLobbyRecord(h.db, id); err != nil {
				log.Printf("lobby cleanup failed for %s: %v", id, err)
				h.lobbies[id] = snap
			}
		}
	}
}
