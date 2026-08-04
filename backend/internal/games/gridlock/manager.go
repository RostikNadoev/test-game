package gridlock

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"tg-lobbies-base/internal/matcheconomy"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode = "grid_lock"

	BoardSize       = 9
	StartingWalls   = 10
	CountdownTime   = 3 * time.Second
	TurnTime        = 10 * time.Second
	SessionTTL      = 20 * time.Minute
	FinishedKeepTTL = 5 * time.Minute

	PhaseWaiting   = "waiting"
	PhaseCountdown = "countdown"
	PhasePlaying   = "playing"
	PhaseMatchOver = "match_over"
)

type Position struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

type Wall struct {
	ID          string `json:"id"`
	Row         int    `json:"row"`
	Col         int    `json:"col"`
	Orientation string `json:"orientation"`
	UserID      uint   `json:"user_id"`
}

type LastAction struct {
	Sequence    uint64 `json:"sequence"`
	Kind        string `json:"kind"`
	UserID      uint   `json:"user_id"`
	Row         int    `json:"row,omitempty"`
	Col         int    `json:"col,omitempty"`
	Orientation string `json:"orientation,omitempty"`
}

type ClientMessage struct {
	Type        string `json:"type"`
	Row         int    `json:"row,omitempty"`
	Col         int    `json:"col,omitempty"`
	Orientation string `json:"orientation,omitempty"`
}

type PublicState struct {
	Type            string            `json:"type"`
	Game            string            `json:"game"`
	LobbyID         string            `json:"lobby_id"`
	Phase           string            `json:"phase"`
	Ready           bool              `json:"ready"`
	ServerMS        int64             `json:"server_ms"`
	PlayerOrder     []uint            `json:"player_order"`
	Positions       map[uint]Position `json:"positions"`
	Walls           []Wall            `json:"walls"`
	WallsLeft       map[uint]int      `json:"walls_left"`
	TurnUserID      uint              `json:"turn_user_id,omitempty"`
	TurnNumber      uint64            `json:"turn_number"`
	CountdownEndsMS int64             `json:"countdown_ends_ms,omitempty"`
	TurnEndsMS      int64             `json:"turn_ends_ms,omitempty"`
	WinnerUserID    uint              `json:"winner_user_id,omitempty"`
	Draw            bool              `json:"draw"`
	BetCoins        float64           `json:"bet_coins"`
	WinnerProfit    float64           `json:"winner_profit"`
	LastAction      *LastAction       `json:"last_action,omitempty"`
	Message         string            `json:"message,omitempty"`
}

type Client struct {
	userID uint
	conn   *websocket.Conn
	mu     sync.Mutex
}

func (c *Client) Send(payload any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return c.conn.WriteJSON(payload)
}

type Manager struct {
	mu          sync.Mutex
	sessions    map[string]*Session
	onMatchOver func(lobbyID string, winnerUserID *uint)
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*Session)}
}

func (m *Manager) SetOnMatchOver(fn func(lobbyID string, winnerUserID *uint)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onMatchOver = fn
}

func (m *Manager) Connect(
	lobbyID string,
	playerIDs []uint,
	userID uint,
	betCoins float64,
	conn *websocket.Conn,
) error {
	if strings.TrimSpace(lobbyID) == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("grid lock requires exactly 2 players")
	}
	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	m.mu.Lock()
	session := m.sessions[lobbyID]
	if session == nil {
		session = NewSession(lobbyID, ids, betCoins, m.onMatchOver)
		m.sessions[lobbyID] = session
	}
	m.mu.Unlock()

	return session.Attach(userID, conn)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for now := range ticker.C {
		m.mu.Lock()
		for id, session := range m.sessions {
			if session.CanCleanup(now) {
				delete(m.sessions, id)
				session.Close()
			}
		}
		m.mu.Unlock()
	}
}

type Session struct {
	mu sync.Mutex

	lobbyID     string
	playerOrder []uint
	clients     map[uint]*Client
	betCoins    float64

	phase           string
	positions       map[uint]Position
	walls           []Wall
	wallsLeft       map[uint]int
	turnUserID      uint
	turnNumber      uint64
	countdownEndsAt time.Time
	turnEndsAt      time.Time
	winnerUserID    uint
	draw            bool
	lastAction      *LastAction
	actionSequence  uint64
	wallSequence    uint64

	countdownTimer *time.Timer
	turnTimer      *time.Timer

	onMatchOver func(lobbyID string, winnerUserID *uint)
	settled     bool
	closed      bool
	paused      bool
	pauseCountdown time.Duration
	pauseTurn      time.Duration
	lastActive  time.Time
}

func NewSession(
	lobbyID string,
	playerIDs []uint,
	betCoins float64,
	onMatchOver func(lobbyID string, winnerUserID *uint),
) *Session {
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	return &Session{
		lobbyID:     lobbyID,
		playerOrder: ids,
		clients:     make(map[uint]*Client),
		betCoins:    maxFloat64(0, betCoins),
		phase:       PhaseWaiting,
		positions: map[uint]Position{
			ids[0]: {Row: BoardSize - 1, Col: BoardSize / 2},
			ids[1]: {Row: 0, Col: BoardSize / 2},
		},
		walls: make([]Wall, 0, StartingWalls*2),
		wallsLeft: map[uint]int{
			ids[0]: StartingWalls,
			ids[1]: StartingWalls,
		},
		onMatchOver: onMatchOver,
		lastActive:  time.Now(),
	}
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	client := &Client{userID: userID, conn: conn}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return errors.New("match session is closed")
	}
	if old := s.clients[userID]; old != nil {
		_ = old.conn.Close()
	}
	s.clients[userID] = client
	s.lastActive = time.Now()

	if len(s.clients) == 2 && s.phase == PhaseWaiting && !s.settled {
		s.startCountdownLocked()
	}
	state := s.publicStateLocked()
	s.mu.Unlock()

	_ = client.Send(state)

	defer func() {
		s.mu.Lock()
		if s.clients[userID] == client {
			delete(s.clients, userID)
		}
		s.lastActive = time.Now()
		s.mu.Unlock()
		_ = conn.Close()
	}()

	conn.SetReadLimit(16 << 10)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})

	pingDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		defer close(pingDone)

		for range ticker.C {
			client.mu.Lock()
			deadline := time.Now().Add(5 * time.Second)
			_ = conn.SetWriteDeadline(deadline)
			err := conn.WriteControl(websocket.PingMessage, []byte("ping"), deadline)
			client.mu.Unlock()
			if err != nil {
				_ = conn.Close()
				return
			}
		}
	}()

	for {
		var message ClientMessage
		if err := conn.ReadJSON(&message); err != nil {
			return nil
		}
		s.Handle(userID, message)

		select {
		case <-pingDone:
			return nil
		default:
		}
	}
}

func (s *Session) Handle(userID uint, message ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return
	}
	s.lastActive = time.Now()

	switch strings.TrimSpace(strings.ToLower(message.Type)) {
	case "state":
		s.sendToLocked(userID, s.publicStateLocked())
	case "move":
		s.moveLocked(userID, Position{Row: message.Row, Col: message.Col})
	case "wall":
		s.placeWallLocked(userID, message.Row, message.Col, message.Orientation)
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) startCountdownLocked() {
	if s.phase != PhaseWaiting || s.settled || s.closed {
		return
	}
	if s.countdownTimer != nil {
		s.countdownTimer.Stop()
	}

	s.phase = PhaseCountdown
	s.countdownEndsAt = time.Now().UTC().Add(CountdownTime)
	s.turnUserID = 0
	s.turnEndsAt = time.Time{}
	s.broadcastLocked(s.publicStateLocked())

	s.countdownTimer = time.AfterFunc(CountdownTime, func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		if s.paused || s.closed || s.settled || s.phase != PhaseCountdown {
			return
		}
		if len(s.clients) < 2 {
			s.phase = PhaseWaiting
			s.countdownEndsAt = time.Time{}
			s.broadcastLocked(s.publicStateLocked())
			return
		}

		s.phase = PhasePlaying
		s.countdownEndsAt = time.Time{}
		s.beginTurnLocked(s.playerOrder[0])
		s.broadcastLocked(s.publicStateLocked())
	})
}

func (s *Session) beginTurnLocked(userID uint) {
	if s.turnTimer != nil {
		s.turnTimer.Stop()
		s.turnTimer = nil
	}

	s.turnUserID = userID
	s.turnNumber++
	s.turnEndsAt = time.Now().UTC().Add(TurnTime)

	expectedTurn := s.turnNumber
	expectedUser := userID
	s.turnTimer = time.AfterFunc(TurnTime, func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		if s.paused || s.closed || s.settled || s.phase != PhasePlaying {
			return
		}
		if s.turnNumber != expectedTurn || s.turnUserID != expectedUser {
			return
		}

		s.recordActionLocked("timeout", expectedUser, 0, 0, "")
		s.beginTurnLocked(s.otherPlayerLocked(expectedUser))
		s.broadcastLocked(s.publicStateLocked())
	})
}

func (s *Session) moveLocked(userID uint, target Position) {
	if !s.canActLocked(userID) {
		return
	}
	if !inBoard(target) {
		s.sendErrorLocked(userID, "move is outside the board")
		return
	}

	from := s.positions[userID]
	otherID := s.otherPlayerLocked(userID)
	other := s.positions[otherID]
	blocked := buildBlocked(s.walls)
	if !containsPosition(legalMoves(from, other, blocked), target) {
		s.sendErrorLocked(userID, "illegal move")
		return
	}

	s.positions[userID] = target
	s.recordActionLocked("move", userID, target.Row, target.Col, "")

	if s.hasReachedGoalLocked(userID, target) {
		s.finishLocked(userID)
		return
	}

	s.beginTurnLocked(otherID)
	s.broadcastLocked(s.publicStateLocked())
}

func (s *Session) placeWallLocked(userID uint, row int, col int, orientation string) {
	if !s.canActLocked(userID) {
		return
	}
	orientation = strings.TrimSpace(strings.ToLower(orientation))
	if orientation != "h" && orientation != "v" {
		s.sendErrorLocked(userID, "orientation must be h or v")
		return
	}
	if s.wallsLeft[userID] <= 0 {
		s.sendErrorLocked(userID, "no walls left")
		return
	}

	candidate := Wall{Row: row, Col: col, Orientation: orientation, UserID: userID}
	if !wallValid(candidate, s.walls, s.positions[s.playerOrder[0]], s.positions[s.playerOrder[1]]) {
		s.sendErrorLocked(userID, "illegal wall")
		return
	}

	s.wallSequence++
	candidate.ID = fmt.Sprintf("w-%d", s.wallSequence)
	s.walls = append(s.walls, candidate)
	s.wallsLeft[userID]--
	s.recordActionLocked("wall", userID, row, col, orientation)

	s.beginTurnLocked(s.otherPlayerLocked(userID))
	s.broadcastLocked(s.publicStateLocked())
}

func (s *Session) canActLocked(userID uint) bool {
	if s.paused || s.phase != PhasePlaying || s.settled || s.closed {
		s.sendErrorLocked(userID, "match is not accepting actions")
		return false
	}
	if s.turnUserID != userID {
		s.sendErrorLocked(userID, "it is not your turn")
		return false
	}
	return true
}

func (s *Session) recordActionLocked(kind string, userID uint, row int, col int, orientation string) {
	s.actionSequence++
	s.lastAction = &LastAction{
		Sequence:    s.actionSequence,
		Kind:        kind,
		UserID:      userID,
		Row:         row,
		Col:         col,
		Orientation: orientation,
	}
}

func (s *Session) finishLocked(winnerUserID uint) {
	if s.settled || s.closed || s.phase == PhaseMatchOver {
		return
	}
	if s.turnTimer != nil {
		s.turnTimer.Stop()
		s.turnTimer = nil
	}

	s.phase = PhaseMatchOver
	s.turnUserID = 0
	s.turnEndsAt = time.Time{}
	s.winnerUserID = winnerUserID
	s.draw = winnerUserID == 0
	s.settled = true
	s.broadcastLocked(s.publicStateLocked())

	if s.onMatchOver != nil {
		lobbyID := s.lobbyID
		callback := s.onMatchOver
		go func() {
			if winnerUserID == 0 {
				callback(lobbyID, nil)
				return
			}
			winner := winnerUserID
			callback(lobbyID, &winner)
		}()
	}
}

func (s *Session) hasReachedGoalLocked(userID uint, position Position) bool {
	if userID == s.playerOrder[0] {
		return position.Row == 0
	}
	return position.Row == BoardSize-1
}

func (s *Session) otherPlayerLocked(userID uint) uint {
	if userID == s.playerOrder[0] {
		return s.playerOrder[1]
	}
	return s.playerOrder[0]
}

func (s *Session) publicStateLocked() PublicState {
	positions := make(map[uint]Position, len(s.positions))
	for id, position := range s.positions {
		positions[id] = position
	}
	wallsLeft := make(map[uint]int, len(s.wallsLeft))
	for id, count := range s.wallsLeft {
		wallsLeft[id] = count
	}
	walls := append([]Wall(nil), s.walls...)

	state := PublicState{
		Type:         "state",
		Game:         GameCode,
		LobbyID:      s.lobbyID,
		Phase:        s.phase,
		Ready:        len(s.clients) == 2,
		ServerMS:     time.Now().UTC().UnixMilli(),
		PlayerOrder:  append([]uint(nil), s.playerOrder...),
		Positions:    positions,
		Walls:        walls,
		WallsLeft:    wallsLeft,
		TurnUserID:   s.turnUserID,
		TurnNumber:   s.turnNumber,
		WinnerUserID: s.winnerUserID,
		Draw:         s.draw,
		BetCoins:     s.betCoins,
		WinnerProfit: s.winnerProfitLocked(),
		LastAction:   cloneLastAction(s.lastAction),
		Message:      s.messageLocked(),
	}
	if !s.countdownEndsAt.IsZero() {
		state.CountdownEndsMS = s.countdownEndsAt.UTC().UnixMilli()
	}
	if !s.turnEndsAt.IsZero() {
		state.TurnEndsMS = s.turnEndsAt.UTC().UnixMilli()
	}
	return state
}

func (s *Session) winnerProfitLocked() float64 {
	if s.phase != PhaseMatchOver || s.draw || s.winnerUserID == 0 {
		return 0
	}
	return matcheconomy.WinnerProfit(s.betCoins)
}

func (s *Session) messageLocked() string {
	switch s.phase {
	case PhaseWaiting:
		return "Ждём второго игрока"
	case PhaseCountdown:
		return "Матч начинается"
	case PhasePlaying:
		return "Ход игрока"
	case PhaseMatchOver:
		return "Матч завершён"
	default:
		return ""
	}
}

func (s *Session) broadcastLocked(payload any) {
	for _, client := range s.clients {
		_ = client.Send(payload)
	}
}

func (s *Session) sendToLocked(userID uint, payload any) {
	if client := s.clients[userID]; client != nil {
		_ = client.Send(payload)
	}
}

func (s *Session) sendErrorLocked(userID uint, message string) {
	s.sendToLocked(userID, map[string]any{"type": "error", "error": message})
}

func (s *Session) CanCleanup(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return true
	}
	if s.settled && now.Sub(s.lastActive) > FinishedKeepTTL {
		return true
	}
	return len(s.clients) == 0 && now.Sub(s.lastActive) > SessionTTL
}

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return
	}
	s.closed = true
	if s.countdownTimer != nil {
		s.countdownTimer.Stop()
	}
	if s.turnTimer != nil {
		s.turnTimer.Stop()
	}
	for _, client := range s.clients {
		_ = client.conn.Close()
	}
	s.clients = make(map[uint]*Client)
}

func cloneLastAction(value *LastAction) *LastAction {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func containsPlayer(players []uint, userID uint) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}
	return false
}

func samePosition(a Position, b Position) bool {
	return a.Row == b.Row && a.Col == b.Col
}

func inBoard(position Position) bool {
	return position.Row >= 0 && position.Row < BoardSize && position.Col >= 0 && position.Col < BoardSize
}

func positionKey(position Position) string {
	return fmt.Sprintf("%d,%d", position.Row, position.Col)
}

func edgeKey(a Position, b Position) string {
	first := positionKey(a)
	second := positionKey(b)
	if first < second {
		return first + "|" + second
	}
	return second + "|" + first
}

func buildBlocked(walls []Wall) map[string]struct{} {
	blocked := make(map[string]struct{}, len(walls)*2)
	for _, wall := range walls {
		if wall.Orientation == "h" {
			blocked[edgeKey(Position{Row: wall.Row, Col: wall.Col}, Position{Row: wall.Row + 1, Col: wall.Col})] = struct{}{}
			blocked[edgeKey(Position{Row: wall.Row, Col: wall.Col + 1}, Position{Row: wall.Row + 1, Col: wall.Col + 1})] = struct{}{}
		} else {
			blocked[edgeKey(Position{Row: wall.Row, Col: wall.Col}, Position{Row: wall.Row, Col: wall.Col + 1})] = struct{}{}
			blocked[edgeKey(Position{Row: wall.Row + 1, Col: wall.Col}, Position{Row: wall.Row + 1, Col: wall.Col + 1})] = struct{}{}
		}
	}
	return blocked
}

func blockedEdge(a Position, b Position, blocked map[string]struct{}) bool {
	_, exists := blocked[edgeKey(a, b)]
	return exists
}

func legalMoves(from Position, other Position, blocked map[string]struct{}) []Position {
	directions := []Position{{Row: -1}, {Row: 1}, {Col: -1}, {Col: 1}}
	moves := make([]Position, 0, 8)

	for _, direction := range directions {
		adjacent := Position{Row: from.Row + direction.Row, Col: from.Col + direction.Col}
		if !inBoard(adjacent) || blockedEdge(from, adjacent, blocked) {
			continue
		}

		if !samePosition(adjacent, other) {
			moves = append(moves, adjacent)
			continue
		}

		beyond := Position{Row: other.Row + direction.Row, Col: other.Col + direction.Col}
		if inBoard(beyond) && !blockedEdge(other, beyond, blocked) {
			moves = append(moves, beyond)
			continue
		}

		var sideDirections []Position
		if direction.Row != 0 {
			sideDirections = []Position{{Col: -1}, {Col: 1}}
		} else {
			sideDirections = []Position{{Row: -1}, {Row: 1}}
		}
		for _, side := range sideDirections {
			diagonal := Position{Row: other.Row + side.Row, Col: other.Col + side.Col}
			if inBoard(diagonal) && !blockedEdge(other, diagonal, blocked) {
				moves = append(moves, diagonal)
			}
		}
	}

	return uniquePositions(moves)
}

func uniquePositions(values []Position) []Position {
	seen := make(map[string]bool, len(values))
	result := make([]Position, 0, len(values))
	for _, value := range values {
		key := positionKey(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, value)
	}
	return result
}

func containsPosition(values []Position, target Position) bool {
	for _, value := range values {
		if samePosition(value, target) {
			return true
		}
	}
	return false
}

func wallConflict(candidate Wall, walls []Wall) bool {
	for _, wall := range walls {
		if wall.Row == candidate.Row && wall.Col == candidate.Col {
			return true
		}
		if candidate.Orientation == "h" && wall.Orientation == "h" && wall.Row == candidate.Row && abs(wall.Col-candidate.Col) == 1 {
			return true
		}
		if candidate.Orientation == "v" && wall.Orientation == "v" && wall.Col == candidate.Col && abs(wall.Row-candidate.Row) == 1 {
			return true
		}
	}
	return false
}

func wallValid(candidate Wall, walls []Wall, player1 Position, player2 Position) bool {
	if candidate.Row < 0 || candidate.Row > BoardSize-2 || candidate.Col < 0 || candidate.Col > BoardSize-2 {
		return false
	}
	if candidate.Orientation != "h" && candidate.Orientation != "v" {
		return false
	}
	if wallConflict(candidate, walls) {
		return false
	}

	withCandidate := append(append([]Wall(nil), walls...), candidate)
	blocked := buildBlocked(withCandidate)
	return hasPath(player1, 0, blocked) && hasPath(player2, BoardSize-1, blocked)
}

func hasPath(start Position, goalRow int, blocked map[string]struct{}) bool {
	queue := []Position{start}
	seen := map[string]bool{positionKey(start): true}

	for index := 0; index < len(queue); index++ {
		current := queue[index]
		if current.Row == goalRow {
			return true
		}

		neighbors := []Position{
			{Row: current.Row - 1, Col: current.Col},
			{Row: current.Row + 1, Col: current.Col},
			{Row: current.Row, Col: current.Col - 1},
			{Row: current.Row, Col: current.Col + 1},
		}
		for _, next := range neighbors {
			key := positionKey(next)
			if !inBoard(next) || seen[key] || blockedEdge(current, next, blocked) {
				continue
			}
			seen[key] = true
			queue = append(queue, next)
		}
	}

	return false
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func maxFloat64(a float64, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func roundToTwo(value float64) float64 {
	if value <= 0 {
		return 0
	}
	return float64(int64(value*100+0.5)) / 100
}
