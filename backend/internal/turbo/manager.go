package turbo

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"math/big"
	"sync"
	"time"

	"tg-lobbies-base/internal/models"
	"tg-lobbies-base/internal/realtime"
	"tg-lobbies-base/internal/services"

	"gorm.io/gorm"
)

const BetCoins = 100.0
const queueHeartbeatTTL = 5 * time.Second

var gamePool = []string{
	"plinko_pvp",
	"descent_duel",
	"paper_io",
	"tower_stack",
	"grid_lock",
	"neon_matrix",
	"dunk_shot",
	"flappy_race",
	"disc_football",
	"doodle_jump",
	"crossy_pvp",
	"coin_chase",
	"cube_fill",
	"ballz_duel",
	"draw_drop",
	"tilt_maze",
}

type Status struct {
	Status         string            `json:"status"`
	SeriesID       string            `json:"series_id,omitempty"`
	BetCoins       float64           `json:"bet_coins"`
	Round          int               `json:"round,omitempty"`
	Games          []string          `json:"games,omitempty"`
	Wins           map[uint]int      `json:"wins,omitempty"`
	PlayerIDs      []uint            `json:"player_ids,omitempty"`
	CurrentGame    string            `json:"current_game,omitempty"`
	CurrentLobby   *realtime.LobbyDTO `json:"current_lobby,omitempty"`
	WinnerUserID   *uint             `json:"winner_user_id,omitempty"`
	Draw           bool              `json:"draw,omitempty"`
	LastRoundWinner *uint            `json:"last_round_winner_user_id,omitempty"`
}

type series struct {
	id              string
	players         []uint
	games           []string
	wins            map[uint]int
	round           int
	currentLobbyID  string
	status          string
	winner          *uint
	draw            bool
	lastRoundWinner *uint
	finishedAt      time.Time
}

type Manager struct {
	mu           sync.Mutex
	db           *gorm.DB
	hub          *realtime.Hub
	queue        []uint
	queued       map[uint]bool
	queueSeenAt  map[uint]time.Time
	seriesByID   map[string]*series
	seriesByUser map[uint]*series
	roundByLobby map[string]*series
}

func NewManager(db *gorm.DB, hub *realtime.Hub) *Manager {
	manager := &Manager{
		db:           db,
		hub:          hub,
		queued:       make(map[uint]bool),
		queueSeenAt:  make(map[uint]time.Time),
		seriesByID:   make(map[string]*series),
		seriesByUser: make(map[uint]*series),
		roundByLobby: make(map[string]*series),
	}
	manager.refundInterruptedSeries()
	return manager
}

func (m *Manager) refundInterruptedSeries() {
	if m.db == nil {
		return
	}

	var matches []models.Match
	if err := m.db.
		Where("game = ? AND status = ?", "turbo", models.MatchStatusPlaying).
		Find(&matches).Error; err != nil {
		log.Printf("turbo recovery lookup failed: %v", err)
		return
	}

	for _, match := range matches {
		if _, err := services.SettleMatch(m.db, match.LobbyID, nil); err != nil {
			log.Printf("turbo recovery refund failed for series %s: %v", match.LobbyID, err)
		}
	}
}

func (m *Manager) Join(userID uint) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if existing := m.seriesByUser[userID]; existing != nil && existing.status != "finished" {
		return m.statusLocked(existing), nil
	}
	if m.queued[userID] {
		m.queueSeenAt[userID] = time.Now()
		return Status{Status: "searching", BetCoins: BetCoins}, nil
	}
	if m.hub.UserHasActiveLobby(userID) {
		return Status{}, errors.New("finish the active lobby first")
	}
	if err := m.ensureBalance(userID); err != nil {
		return Status{}, err
	}

	for len(m.queue) > 0 {
		opponent := m.queue[0]
		m.queue = m.queue[1:]
		delete(m.queued, opponent)
		lastSeen := m.queueSeenAt[opponent]
		delete(m.queueSeenAt, opponent)
		if opponent == userID ||
			lastSeen.IsZero() ||
			time.Since(lastSeen) > queueHeartbeatTTL ||
			m.hub.UserHasActiveLobby(opponent) ||
			m.ensureBalance(opponent) != nil {
			continue
		}

		s, err := m.createSeriesLocked(opponent, userID)
		if err != nil {
			return Status{}, err
		}
		return m.statusLocked(s), nil
	}

	m.queue = append(m.queue, userID)
	m.queued[userID] = true
	m.queueSeenAt[userID] = time.Now()
	return Status{Status: "searching", BetCoins: BetCoins}, nil
}

func (m *Manager) Cancel(userID uint) Status {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s := m.seriesByUser[userID]; s != nil && s.status != "finished" {
		return m.statusLocked(s)
	}
	if m.queued[userID] {
		delete(m.queued, userID)
		delete(m.queueSeenAt, userID)
		filtered := m.queue[:0]
		for _, id := range m.queue {
			if id != userID {
				filtered = append(filtered, id)
			}
		}
		m.queue = filtered
	}
	return Status{Status: "idle", BetCoins: BetCoins}
}

func (m *Manager) Status(userID uint) Status {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s := m.seriesByUser[userID]; s != nil {
		return m.statusLocked(s)
	}
	if m.queued[userID] {
		m.queueSeenAt[userID] = time.Now()
		return Status{Status: "searching", BetCoins: BetCoins}
	}
	return Status{Status: "idle", BetCoins: BetCoins}
}

func (m *Manager) HandleRoundResult(lobbyID string, winnerUserID *uint) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	s := m.roundByLobby[lobbyID]
	if s == nil || s.status != "playing" || s.currentLobbyID != lobbyID {
		return false
	}
	delete(m.roundByLobby, lobbyID)
	_, _ = m.hub.FinishLobby(lobbyID)

	s.lastRoundWinner = cloneUint(winnerUserID)
	if winnerUserID != nil {
		s.wins[*winnerUserID]++
	}

	if winnerUserID != nil && s.wins[*winnerUserID] >= 2 {
		m.finishSeriesLocked(s, winnerUserID)
		return true
	}
	if s.round >= len(s.games) {
		var finalWinner *uint
		if s.wins[s.players[0]] > s.wins[s.players[1]] {
			id := s.players[0]
			finalWinner = &id
		} else if s.wins[s.players[1]] > s.wins[s.players[0]] {
			id := s.players[1]
			finalWinner = &id
		}
		m.finishSeriesLocked(s, finalWinner)
		return true
	}

	s.round++
	next, err := m.hub.CreateManagedLobby(s.players, "Turbo round", s.games[s.round-1], 0)
	if err != nil {
		m.finishSeriesLocked(s, nil)
		return true
	}
	s.currentLobbyID = next.ID
	m.roundByLobby[next.ID] = s
	return true
}

func (m *Manager) createSeriesLocked(first, second uint) (*series, error) {
	players := []uint{first, second}
	games := randomGames(3)
	seriesID := randomID()

	firstLobby, err := m.hub.CreateManagedLobby(players, "Turbo round", games[0], 0)
	if err != nil {
		return nil, err
	}
	if err := services.ReserveBet(m.db, first, seriesID, BetCoins); err != nil {
		_, _ = m.hub.FinishLobby(firstLobby.ID)
		return nil, err
	}
	if err := services.ReserveBet(m.db, second, seriesID, BetCoins); err != nil {
		_ = services.RefundBet(m.db, first, seriesID)
		_, _ = m.hub.FinishLobby(firstLobby.ID)
		return nil, err
	}
	if _, err := services.CreateMatch(m.db, seriesID, "turbo", BetCoins, players); err != nil {
		_ = services.RefundBet(m.db, first, seriesID)
		_ = services.RefundBet(m.db, second, seriesID)
		_, _ = m.hub.FinishLobby(firstLobby.ID)
		return nil, err
	}

	s := &series{
		id:             seriesID,
		players:        players,
		games:          games,
		wins:           map[uint]int{first: 0, second: 0},
		round:          1,
		currentLobbyID: firstLobby.ID,
		status:         "playing",
	}
	m.seriesByID[seriesID] = s
	m.seriesByUser[first] = s
	m.seriesByUser[second] = s
	m.roundByLobby[firstLobby.ID] = s
	return s, nil
}

func (m *Manager) finishSeriesLocked(s *series, winner *uint) {
	s.status = "finished"
	s.winner = cloneUint(winner)
	s.draw = winner == nil
	s.finishedAt = time.Now().UTC()
	if _, err := services.SettleMatch(m.db, s.id, winner); err != nil {
		log.Printf("turbo settlement failed for series %s: %v", s.id, err)
	}
}

func (m *Manager) statusLocked(s *series) Status {
	status := Status{
		Status:          s.status,
		SeriesID:        s.id,
		BetCoins:        BetCoins,
		Round:           s.round,
		Games:           append([]string(nil), s.games...),
		Wins:            copyWins(s.wins),
		PlayerIDs:       append([]uint(nil), s.players...),
		CurrentGame:     s.games[minInt(s.round-1, len(s.games)-1)],
		WinnerUserID:    cloneUint(s.winner),
		Draw:            s.draw,
		LastRoundWinner: cloneUint(s.lastRoundWinner),
	}
	if lobby, err := m.hub.GetLobbyDTO(s.currentLobbyID); err == nil {
		status.CurrentLobby = &lobby
	}
	return status
}

func (m *Manager) ensureBalance(userID uint) error {
	user, err := services.GetUserProfile(m.db, userID)
	if err != nil {
		return err
	}
	if user.BalanceGame < BetCoins {
		return services.ErrInsufficientBalance
	}
	return nil
}

func randomGames(count int) []string {
	pool := append([]string(nil), gamePool...)
	for index := len(pool) - 1; index > 0; index-- {
		value, err := rand.Int(rand.Reader, big.NewInt(int64(index+1)))
		if err != nil {
			value = big.NewInt(int64(index))
		}
		swap := int(value.Int64())
		pool[index], pool[swap] = pool[swap], pool[index]
	}
	return append([]string(nil), pool[:count]...)
}

func randomID() string {
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(value)
}

func cloneUint(value *uint) *uint {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func copyWins(source map[uint]int) map[uint]int {
	result := make(map[uint]int, len(source))
	for id, wins := range source {
		result[id] = wins
	}
	return result
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}
