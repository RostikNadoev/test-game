package dunkshot

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode = "dunk_shot"

	PhaseWaiting   = "waiting"
	PhaseCountdown = "countdown"
	PhasePlaying   = "playing"
	PhaseMatchOver = "match_over"

	CountdownDuration = 3 * time.Second
	MatchDuration     = 45 * time.Second
	MinScoreInterval  = 180 * time.Millisecond
	SessionTTL        = 30 * time.Minute
)

type ClientMessage struct {
	Type    string `json:"type"`
	EventID uint64 `json:"event_id,omitempty"`
	Grade   string `json:"grade,omitempty"`
}

type PublicState struct {
	Type            string       `json:"type"`
	Game            string       `json:"game"`
	LobbyID         string       `json:"lobby_id"`
	Phase           string       `json:"phase"`
	Ready           bool         `json:"ready"`
	ServerMS        int64        `json:"server_ms"`
	Seed            int64        `json:"seed"`
	PlayerOrder     []uint       `json:"player_order"`
	Scores          map[uint]int `json:"scores"`
	Combos          map[uint]int `json:"combos"`
	CountdownEndsMS int64        `json:"countdown_ends_ms,omitempty"`
	MatchEndsMS     int64        `json:"match_ends_ms,omitempty"`
	WinnerUserID    uint         `json:"winner_user_id,omitempty"`
	Draw            bool         `json:"draw,omitempty"`
	LastEventUserID uint         `json:"last_event_user_id,omitempty"`
	LastEventGrade  string       `json:"last_event_grade,omitempty"`
	LastEventPoints int          `json:"last_event_points,omitempty"`
	LastEventID     uint64       `json:"last_event_id,omitempty"`
	Message         string       `json:"message,omitempty"`
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
	conn *websocket.Conn,
) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("dunk shot requires exactly 2 players")
	}
	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	m.mu.Lock()
	session := m.sessions[lobbyID]
	if session == nil {
		session = NewSession(lobbyID, ids, m.onMatchOver)
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

type Session struct {
	mu sync.Mutex

	lobbyID     string
	playerOrder []uint
	clients     map[uint]*Client
	scores      map[uint]int
	combos      map[uint]int
	lastEventID map[uint]uint64
	lastScoreAt map[uint]time.Time

	phase           string
	seed            int64
	countdownEndsAt time.Time
	matchEndsAt     time.Time
	winnerUserID    uint
	draw            bool
	lastEventUserID uint
	lastEventGrade  string
	lastEventPoints int
	lastActivity    time.Time
	settled         bool
	closed          bool
	paused          bool
	pauseCountdown  time.Duration
	pauseMatch      time.Duration

	countdownTimer *time.Timer
	matchTimer     *time.Timer
	onMatchOver    func(lobbyID string, winnerUserID *uint)
}

func NewSession(
	lobbyID string,
	playerIDs []uint,
	onMatchOver func(lobbyID string, winnerUserID *uint),
) *Session {
	seed := randomSeed()

	return &Session{
		lobbyID:     lobbyID,
		playerOrder: append([]uint(nil), playerIDs...),
		clients:     make(map[uint]*Client),
		scores: map[uint]int{
			playerIDs[0]: 0,
			playerIDs[1]: 0,
		},
		combos: map[uint]int{
			playerIDs[0]: 0,
			playerIDs[1]: 0,
		},
		lastEventID: map[uint]uint64{
			playerIDs[0]: 0,
			playerIDs[1]: 0,
		},
		lastScoreAt: map[uint]time.Time{
			playerIDs[0]: {},
			playerIDs[1]: {},
		},
		phase:        PhaseWaiting,
		seed:         seed,
		lastActivity: time.Now(),
		onMatchOver:  onMatchOver,
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
	s.lastActivity = time.Now()

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
		s.lastActivity = time.Now()
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

	if s.closed || !containsPlayer(s.playerOrder, userID) {
		return
	}

	s.lastActivity = time.Now()

	switch message.Type {
	case "state":
		s.sendToLocked(userID, s.publicStateLocked())
	case "score":
		s.applyScoreLocked(userID, message.EventID, message.Grade)
	case "miss":
		s.applyMissLocked(userID, message.EventID)
	case "ping":
		s.sendToLocked(userID, map[string]any{
			"type":      "pong",
			"server_ms": time.Now().UTC().UnixMilli(),
		})
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) applyScoreLocked(userID uint, eventID uint64, grade string) {
	if s.paused || s.phase != PhasePlaying || time.Now().After(s.matchEndsAt) {
		return
	}
	if eventID == 0 || eventID <= s.lastEventID[userID] {
		return
	}

	now := time.Now()
	if previous := s.lastScoreAt[userID]; !previous.IsZero() && now.Sub(previous) < MinScoreInterval {
		s.sendErrorLocked(userID, "score event is too fast")
		return
	}

	base := 0
	switch grade {
	case "bucket":
		base = 14
	case "swish":
		base = 24
	case "perfect":
		base = 35
	default:
		s.sendErrorLocked(userID, "invalid score grade")
		return
	}

	s.lastEventID[userID] = eventID
	s.lastScoreAt[userID] = now
	s.combos[userID]++

	multiplier := 1 + maxInt(0, s.combos[userID]-1)/3
	if multiplier > 5 {
		multiplier = 5
	}

	points := base * multiplier
	s.scores[userID] += points
	s.lastEventUserID = userID
	s.lastEventGrade = grade
	s.lastEventPoints = points

	s.broadcastLocked(s.publicStateLocked())
}

func (s *Session) applyMissLocked(userID uint, eventID uint64) {
	if s.paused || s.phase != PhasePlaying || time.Now().After(s.matchEndsAt) {
		return
	}
	if eventID == 0 || eventID <= s.lastEventID[userID] {
		return
	}

	s.lastEventID[userID] = eventID
	s.combos[userID] = 0
	s.lastEventUserID = userID
	s.lastEventGrade = "miss"
	s.lastEventPoints = 0

	s.broadcastLocked(s.publicStateLocked())
}

func (s *Session) startCountdownLocked() {
	if s.closed || s.settled || len(s.clients) < 2 {
		return
	}

	if s.countdownTimer != nil {
		s.countdownTimer.Stop()
	}
	if s.matchTimer != nil {
		s.matchTimer.Stop()
	}

	s.seed = randomSeed()
	s.phase = PhaseCountdown
	s.countdownEndsAt = time.Now().Add(CountdownDuration)
	s.matchEndsAt = time.Time{}
	s.winnerUserID = 0
	s.draw = false
	s.lastEventUserID = 0
	s.lastEventGrade = ""
	s.lastEventPoints = 0

	for _, id := range s.playerOrder {
		s.scores[id] = 0
		s.combos[id] = 0
		s.lastEventID[id] = 0
		s.lastScoreAt[id] = time.Time{}
	}

	s.broadcastLocked(s.publicStateLocked())

	s.countdownTimer = time.AfterFunc(CountdownDuration, func() {
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

		s.startPlayingLocked()
	})
}

func (s *Session) startPlayingLocked() {
	s.phase = PhasePlaying
	s.countdownEndsAt = time.Time{}
	s.matchEndsAt = time.Now().Add(MatchDuration)
	s.broadcastLocked(s.publicStateLocked())

	s.matchTimer = time.AfterFunc(MatchDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused {
			s.finishLocked()
		}
	})
}

func (s *Session) finishLocked() {
	if s.closed || s.settled || s.phase == PhaseMatchOver {
		return
	}

	s.phase = PhaseMatchOver
	s.matchEndsAt = time.Time{}

	first := s.playerOrder[0]
	second := s.playerOrder[1]

	s.draw = s.scores[first] == s.scores[second]
	if !s.draw {
		if s.scores[first] > s.scores[second] {
			s.winnerUserID = first
		} else {
			s.winnerUserID = second
		}
	}

	s.settled = true
	s.broadcastLocked(s.publicStateLocked())

	if s.onMatchOver != nil {
		lobbyID := s.lobbyID
		winnerID := s.winnerUserID
		callback := s.onMatchOver

		go func() {
			if winnerID == 0 {
				callback(lobbyID, nil)
				return
			}
			winner := winnerID
			callback(lobbyID, &winner)
		}()
	}
}

func (s *Session) publicStateLocked() PublicState {
	scores := make(map[uint]int, len(s.scores))
	combos := make(map[uint]int, len(s.combos))
	for _, id := range s.playerOrder {
		scores[id] = s.scores[id]
		combos[id] = s.combos[id]
	}

	state := PublicState{
		Type:            "state",
		Game:            GameCode,
		LobbyID:         s.lobbyID,
		Phase:           s.phase,
		Ready:           len(s.clients) == 2,
		ServerMS:        time.Now().UTC().UnixMilli(),
		Seed:            s.seed,
		PlayerOrder:     append([]uint(nil), s.playerOrder...),
		Scores:          scores,
		Combos:          combos,
		WinnerUserID:    s.winnerUserID,
		Draw:            s.draw,
		LastEventUserID: s.lastEventUserID,
		LastEventGrade:  s.lastEventGrade,
		LastEventPoints: s.lastEventPoints,
		Message:         s.messageLocked(),
	}

	if !s.countdownEndsAt.IsZero() {
		state.CountdownEndsMS = s.countdownEndsAt.UTC().UnixMilli()
	}
	if !s.matchEndsAt.IsZero() {
		state.MatchEndsMS = s.matchEndsAt.UTC().UnixMilli()
	}
	if s.lastEventUserID != 0 {
		state.LastEventID = s.lastEventID[s.lastEventUserID]
	}

	return state
}

func (s *Session) messageLocked() string {
	switch s.phase {
	case PhaseWaiting:
		return "Ждём второго игрока"
	case PhaseCountdown:
		return "Матч начинается"
	case PhasePlaying:
		return "Игра идёт"
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
	s.sendToLocked(userID, map[string]any{
		"type":  "error",
		"error": message,
	})
}

func (s *Session) CanCleanup(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return true
	}
	if s.settled && now.Sub(s.lastActivity) > 5*time.Minute {
		return true
	}
	return len(s.clients) == 0 && now.Sub(s.lastActivity) > SessionTTL
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
	if s.matchTimer != nil {
		s.matchTimer.Stop()
	}

	for _, client := range s.clients {
		_ = client.conn.Close()
	}
	s.clients = make(map[uint]*Client)
}

func containsPlayer(players []uint, userID uint) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}
	return false
}

func randomSeed() int64 {
	var buffer [8]byte
	if _, err := rand.Read(buffer[:]); err == nil {
		value := int64(binary.LittleEndian.Uint64(buffer[:]) & 0x7fffffffffffffff)
		if value > 0 {
			return value
		}
	}
	return time.Now().UnixNano() & 0x7fffffffffffffff
}

func maxInt(first int, second int) int {
	if first > second {
		return first
	}
	return second
}
