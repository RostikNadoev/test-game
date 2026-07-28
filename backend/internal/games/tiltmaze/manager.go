package tiltmaze

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode          = "tilt_maze"
	CountdownDuration = 3 * time.Second
	MatchDuration     = 60 * time.Second
	stateBroadcastGap = 100 * time.Millisecond
	positionMinGap    = 55 * time.Millisecond
	roomRetention     = 2 * time.Minute
)

const (
	PhaseWaiting   = "waiting"
	PhaseCountdown = "countdown"
	PhasePlaying   = "playing"
	PhaseFinished  = "finished"
)

type ClientMessage struct {
	Type string  `json:"type"`
	X    float64 `json:"x,omitempty"`
	Y    float64 `json:"y,omitempty"`
}

type PlayerPublicState struct {
	UserID    uint    `json:"user_id"`
	Finished  bool    `json:"finished"`
	FinishMS  int64   `json:"finish_ms"`
	Remaining float64 `json:"remaining"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
}

type PublicState struct {
	Type            string              `json:"type"`
	Game            string              `json:"game"`
	LobbyID         string              `json:"lobby_id"`
	Phase           string              `json:"phase"`
	Ready           bool                `json:"ready"`
	ServerMS        int64               `json:"server_ms"`
	Seed            uint32              `json:"seed"`
	PlayerOrder     []uint              `json:"player_order"`
	Players         []PlayerPublicState `json:"players"`
	BetCoins        float64             `json:"bet_coins"`
	WinnerProfit    float64             `json:"winner_profit"`
	CountdownEndsMS int64               `json:"countdown_ends_ms,omitempty"`
	MatchStartsMS   int64               `json:"match_starts_ms,omitempty"`
	MatchEndsMS     int64               `json:"match_ends_ms,omitempty"`
	WinnerUserID    uint                `json:"winner_user_id,omitempty"`
	Draw            bool                `json:"draw,omitempty"`
	Message         string              `json:"message,omitempty"`
}

type playerRuntime struct {
	X            float64
	Y            float64
	LastUpdateAt time.Time
	Finished     bool
	FinishMS     int64
}

type clientConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

type room struct {
	mu sync.Mutex

	lobbyID     string
	playerIDs   []uint
	betCoins    float64
	seed        uint32
	maze        mazeSpec
	phase       string
	createdAt   time.Time
	finishedAt  time.Time
	countdownAt time.Time
	matchStart  time.Time
	matchEnd    time.Time
	lastPush    time.Time

	clients map[uint]*clientConn
	players map[uint]*playerRuntime

	winnerUserID uint
	draw         bool
	settled      bool
}

type Manager struct {
	mu          sync.Mutex
	rooms       map[string]*room
	onMatchOver func(lobbyID string, winnerUserID *uint)
}

func NewManager() *Manager {
	return &Manager{rooms: make(map[string]*room)}
}

func (m *Manager) SetOnMatchOver(callback func(lobbyID string, winnerUserID *uint)) {
	m.mu.Lock()
	m.onMatchOver = callback
	m.mu.Unlock()
}

func (m *Manager) Connect(
	lobbyID string,
	playerIDs []uint,
	userID uint,
	betCoins float64,
	conn *websocket.Conn,
) error {
	if m == nil || conn == nil {
		return errors.New("tilt maze manager is not configured")
	}

	lobbyID = strings.TrimSpace(lobbyID)
	if lobbyID == "" {
		return errors.New("lobby id is empty")
	}

	players := uniqueSortedPlayers(playerIDs)
	if len(players) != 2 {
		return errors.New("tilt maze requires exactly two players")
	}
	if !containsUser(players, userID) {
		return errors.New("player is not a member of the match")
	}

	m.mu.Lock()
	r := m.rooms[lobbyID]
	if r == nil {
		seed := randomSeed()
		maze := generateMaze(seed)
		now := time.Now()
		r = &room{
			lobbyID:   lobbyID,
			playerIDs: players,
			betCoins:  betCoins,
			seed:      seed,
			maze:      maze,
			phase:     PhaseWaiting,
			createdAt: now,
			clients:   make(map[uint]*clientConn, 2),
			players:   make(map[uint]*playerRuntime, 2),
		}
		for _, id := range players {
			r.players[id] = &playerRuntime{X: maze.StartX, Y: maze.StartY}
		}
		m.rooms[lobbyID] = r
		go m.runRoom(r)
	}
	m.mu.Unlock()

	r.mu.Lock()
	if !samePlayers(r.playerIDs, players) {
		r.mu.Unlock()
		return errors.New("lobby players changed")
	}
	if previous := r.clients[userID]; previous != nil && previous.conn != conn {
		_ = previous.conn.Close()
	}
	r.clients[userID] = &clientConn{conn: conn}
	if r.phase == PhaseWaiting && len(r.clients) == len(r.playerIDs) {
		now := time.Now()
		r.phase = PhaseCountdown
		r.countdownAt = now.Add(CountdownDuration)
		r.matchStart = r.countdownAt
		r.matchEnd = r.matchStart.Add(MatchDuration)
	}
	state := r.publicStateLocked(time.Now())
	r.mu.Unlock()

	m.sendStateTo(r, userID, state)
	m.broadcast(r)

	return m.readLoop(r, userID, conn)
}

func (m *Manager) readLoop(r *room, userID uint, conn *websocket.Conn) error {
	defer m.detach(r, userID, conn)

	for {
		var message ClientMessage
		if err := conn.ReadJSON(&message); err != nil {
			return err
		}

		switch strings.ToLower(strings.TrimSpace(message.Type)) {
		case "state", "ping":
			m.sendCurrentStateTo(r, userID)
		case "position":
			m.applyPosition(r, userID, message.X, message.Y, false)
		case "finish":
			m.applyPosition(r, userID, message.X, message.Y, true)
		}
	}
}

func (m *Manager) applyPosition(r *room, userID uint, x, y float64, wantsFinish bool) {
	if math.IsNaN(x) || math.IsNaN(y) || math.IsInf(x, 0) || math.IsInf(y, 0) {
		return
	}

	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.phase != PhasePlaying || now.Before(r.matchStart) || !now.Before(r.matchEnd) {
		return
	}

	player := r.players[userID]
	if player == nil || player.Finished {
		return
	}
	if !r.maze.containsPoint(x, y) {
		return
	}

	if !player.LastUpdateAt.IsZero() {
		dt := now.Sub(player.LastUpdateAt)
		if dt < positionMinGap && !wantsFinish {
			return
		}

		maxTravel := 24.0 + 520.0*dt.Seconds()
		distance := math.Hypot(x-player.X, y-player.Y)
		if distance > maxTravel && distance > 0 {
			scale := maxTravel / distance
			x = player.X + (x-player.X)*scale
			y = player.Y + (y-player.Y)*scale
		}

		fromX, fromY := r.maze.cellForPoint(player.X, player.Y)
		toX, toY := r.maze.cellForPoint(x, y)
		maxCells := int(math.Ceil(maxTravel/CellSize)) + 1
		if r.maze.graphDistance(fromX, fromY, toX, toY) > maxCells {
			return
		}
	}

	player.X = x
	player.Y = y
	player.LastUpdateAt = now

	if wantsFinish && r.maze.inExit(x, y) {
		player.Finished = true
		finish := now.Sub(r.matchStart).Milliseconds()
		if finish < 0 {
			finish = 0
		}
		if finish > MatchDuration.Milliseconds() {
			finish = MatchDuration.Milliseconds()
		}
		player.FinishMS = finish
	}
}

func (m *Manager) runRoom(r *room) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for now := range ticker.C {
		var callback func(string, *uint)
		var winner *uint
		shouldBroadcast := false
		shouldStop := false

		r.mu.Lock()
		switch r.phase {
		case PhaseCountdown:
			if !now.Before(r.matchStart) {
				r.phase = PhasePlaying
				shouldBroadcast = true
			}
		case PhasePlaying:
			if !now.Before(r.matchEnd) {
				r.finishMatchLocked(now)
				shouldBroadcast = true
				if r.settled {
					m.mu.Lock()
					callback = m.onMatchOver
					m.mu.Unlock()
					if !r.draw && r.winnerUserID != 0 {
						winnerValue := r.winnerUserID
						winner = &winnerValue
					}
				}
			}
		}

		if r.phase != PhaseFinished && now.Sub(r.lastPush) >= stateBroadcastGap {
			r.lastPush = now
			shouldBroadcast = true
		}

		if r.phase == PhaseFinished && !r.finishedAt.IsZero() && now.Sub(r.finishedAt) >= roomRetention {
			shouldStop = true
		}
		r.mu.Unlock()

		if shouldBroadcast {
			m.broadcast(r)
		}
		if callback != nil {
			go callback(r.lobbyID, winner)
		}
		if shouldStop {
			m.mu.Lock()
			if m.rooms[r.lobbyID] == r {
				delete(m.rooms, r.lobbyID)
			}
			m.mu.Unlock()
			return
		}
	}
}

func (r *room) finishMatchLocked(now time.Time) {
	if r.phase == PhaseFinished {
		return
	}

	r.phase = PhaseFinished
	r.finishedAt = now

	if len(r.playerIDs) != 2 {
		r.draw = true
		r.settled = true
		return
	}

	left := r.players[r.playerIDs[0]]
	right := r.players[r.playerIDs[1]]
	if left == nil || right == nil {
		r.draw = true
		r.settled = true
		return
	}

	switch {
	case left.Finished && right.Finished:
		if left.FinishMS == right.FinishMS {
			r.draw = true
		} else if left.FinishMS < right.FinishMS {
			r.winnerUserID = r.playerIDs[0]
		} else {
			r.winnerUserID = r.playerIDs[1]
		}
	case left.Finished:
		r.winnerUserID = r.playerIDs[0]
	case right.Finished:
		r.winnerUserID = r.playerIDs[1]
	default:
		leftRemaining := r.maze.remainingDistance(left.X, left.Y)
		rightRemaining := r.maze.remainingDistance(right.X, right.Y)
		if math.Abs(leftRemaining-rightRemaining) <= 0.01 {
			r.draw = true
		} else if leftRemaining < rightRemaining {
			r.winnerUserID = r.playerIDs[0]
		} else {
			r.winnerUserID = r.playerIDs[1]
		}
	}

	r.settled = true
}

func (r *room) publicStateLocked(now time.Time) PublicState {
	players := make([]PlayerPublicState, 0, len(r.playerIDs))
	for _, userID := range r.playerIDs {
		player := r.players[userID]
		if player == nil {
			continue
		}
		players = append(players, PlayerPublicState{
			UserID:    userID,
			Finished:  player.Finished,
			FinishMS:  player.FinishMS,
			Remaining: roundDistance(r.maze.remainingDistance(player.X, player.Y)),
			X:         player.X,
			Y:         player.Y,
		})
	}

	publicSeed := uint32(0)
	if r.phase != PhaseWaiting {
		publicSeed = r.seed
	}

	winnerProfit := 0.0
	if r.phase == PhaseFinished && !r.draw && r.winnerUserID != 0 {
		winnerProfit = roundMoney(r.betCoins * 0.8)
	}

	state := PublicState{
		Type:         "state",
		Game:         GameCode,
		LobbyID:      r.lobbyID,
		Phase:        r.phase,
		Ready:        len(r.clients) == len(r.playerIDs),
		ServerMS:     now.UnixMilli(),
		Seed:         publicSeed,
		PlayerOrder:  append([]uint(nil), r.playerIDs...),
		Players:      players,
		BetCoins:     r.betCoins,
		WinnerProfit: winnerProfit,
		WinnerUserID: r.winnerUserID,
		Draw:         r.draw,
	}

	if !r.countdownAt.IsZero() {
		state.CountdownEndsMS = r.countdownAt.UnixMilli()
	}
	if !r.matchStart.IsZero() {
		state.MatchStartsMS = r.matchStart.UnixMilli()
	}
	if !r.matchEnd.IsZero() {
		state.MatchEndsMS = r.matchEnd.UnixMilli()
	}

	return state
}

func (m *Manager) broadcast(r *room) {
	r.mu.Lock()
	state := r.publicStateLocked(time.Now())
	clients := make(map[uint]*clientConn, len(r.clients))
	for userID, client := range r.clients {
		clients[userID] = client
	}
	r.mu.Unlock()

	for _, client := range clients {
		m.writeState(client, state)
	}
}

func (m *Manager) sendCurrentStateTo(r *room, userID uint) {
	r.mu.Lock()
	state := r.publicStateLocked(time.Now())
	client := r.clients[userID]
	r.mu.Unlock()
	if client != nil {
		m.writeState(client, state)
	}
}

func (m *Manager) sendStateTo(r *room, userID uint, state PublicState) {
	r.mu.Lock()
	client := r.clients[userID]
	r.mu.Unlock()
	if client != nil {
		m.writeState(client, state)
	}
}

func (m *Manager) writeState(client *clientConn, state PublicState) {
	if client == nil || client.conn == nil {
		return
	}
	client.writeMu.Lock()
	defer client.writeMu.Unlock()
	_ = client.conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
	_ = client.conn.WriteJSON(state)
}

func (m *Manager) detach(r *room, userID uint, conn *websocket.Conn) {
	r.mu.Lock()
	if current := r.clients[userID]; current != nil && current.conn == conn {
		delete(r.clients, userID)
	}
	r.mu.Unlock()
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		m.mu.Lock()
		for lobbyID, r := range m.rooms {
			r.mu.Lock()
			remove := r.phase == PhaseFinished && !r.finishedAt.IsZero() && now.Sub(r.finishedAt) > roomRetention
			if r.phase == PhaseWaiting && len(r.clients) == 0 && now.Sub(r.createdAt) > roomRetention {
				remove = true
			}
			r.mu.Unlock()
			if remove {
				delete(m.rooms, lobbyID)
			}
		}
		m.mu.Unlock()
	}
}

func uniqueSortedPlayers(playerIDs []uint) []uint {
	seen := make(map[uint]struct{}, len(playerIDs))
	result := make([]uint, 0, len(playerIDs))
	for _, id := range playerIDs {
		if id == 0 {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func containsUser(players []uint, userID uint) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}
	return false
}

func samePlayers(left, right []uint) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func randomSeed() uint32 {
	var buffer [4]byte
	if _, err := rand.Read(buffer[:]); err == nil {
		seed := binary.LittleEndian.Uint32(buffer[:])
		if seed != 0 {
			return seed
		}
	}
	return uint32(time.Now().UnixNano())
}

func roundDistance(value float64) float64 {
	return math.Round(value*100) / 100
}

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}
