package neonmatrix

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode = "neon_matrix"

	StartHP   = 100
	MinNumber = 1
	MaxNumber = 100

	BlindSpinDuration = 3200 * time.Millisecond
	LandingDuration   = 1800 * time.Millisecond
	ImpactDuration    = 3900 * time.Millisecond
	AutoNextRoundWait = 12 * time.Second

	PhasePicking   = "picking"
	PhaseSpinning  = "spinning"
	PhaseLanding   = "landing"
	PhaseImpact    = "impact"
	PhaseResult    = "result"
	PhaseMatchOver = "match_over"
)

type ClientMessage struct {
	Type  string `json:"type"`
	Value int    `json:"value,omitempty"`
}

type RoundOutcome struct {
	Target          int  `json:"target"`
	Player1UserID   uint `json:"player1_user_id"`
	Player2UserID   uint `json:"player2_user_id"`
	Player1Pick     int  `json:"player1_pick"`
	Player2Pick     int  `json:"player2_pick"`
	Player1Distance int  `json:"player1_distance"`
	Player2Distance int  `json:"player2_distance"`
	Damage          int  `json:"damage"`
	AttackerUserID  uint `json:"attacker_user_id,omitempty"`
	DefenderUserID  uint `json:"defender_user_id,omitempty"`
	WinnerUserID    uint `json:"winner_user_id,omitempty"`
	IsDraw          bool `json:"is_draw"`
}

type PublicState struct {
	Type         string        `json:"type"`
	Game         string        `json:"game"`
	LobbyID      string        `json:"lobby_id"`
	Phase        string        `json:"phase"`
	Round        int           `json:"round"`
	ServerMS     int64         `json:"server_ms"`
	PlayerOrder  []uint        `json:"player_order"`
	Health       map[uint]int  `json:"health"`
	Picked       map[uint]bool `json:"picked"`
	Picks        map[uint]*int `json:"picks"`
	Ready        map[uint]bool `json:"ready"`
	Commitment   string        `json:"commitment,omitempty"`
	RevealAtMS   int64         `json:"reveal_at_ms,omitempty"`
	StopAtMS     int64         `json:"stop_at_ms,omitempty"`
	Target       *int          `json:"target,omitempty"`
	RevealNonce  string        `json:"reveal_nonce,omitempty"`
	Outcome      *RoundOutcome `json:"outcome,omitempty"`
	WinnerUserID uint          `json:"winner_user_id,omitempty"`
	Message      string        `json:"message,omitempty"`
}

type Client struct {
	userID uint
	conn   *websocket.Conn
	mu     sync.Mutex
}

func (c *Client) Send(value any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
	return c.conn.WriteJSON(value)
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

func (m *Manager) Connect(lobbyID string, playerIDs []uint, userID uint, conn *websocket.Conn) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("neon matrix requires exactly 2 players")
	}
	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	m.mu.Lock()
	session, ok := m.sessions[lobbyID]
	if !ok {
		session = NewSession(lobbyID, playerIDs, m.onMatchOver)
		m.sessions[lobbyID] = session
	}
	m.mu.Unlock()

	return session.Attach(userID, conn)
}

func (m *Manager) RemoveSession(lobbyID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, lobbyID)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().Add(-45 * time.Minute)
		m.mu.Lock()
		for id, session := range m.sessions {
			session.mu.Lock()
			stale := session.lastActive.Before(cutoff)
			closed := session.matchClosed && time.Since(session.lastActive) > 5*time.Minute
			session.mu.Unlock()
			if stale || closed {
				delete(m.sessions, id)
			}
		}
		m.mu.Unlock()
	}
}

type Session struct {
	mu sync.Mutex

	lobbyID     string
	clients     map[uint]*Client
	playerOrder []uint

	phase  string
	round  int
	health map[uint]int
	picks  map[uint]int
	picked map[uint]bool
	ready  map[uint]bool

	target       int
	nonce        string
	commitment   string
	revealAt     time.Time
	stopAt       time.Time
	outcome      *RoundOutcome
	winnerUserID uint

	revealTimer   *time.Timer
	landingTimer  *time.Timer
	resultTimer   *time.Timer
	autoNextTimer *time.Timer

	onMatchOver func(lobbyID string, winnerUserID *uint)
	matchClosed bool
	lastActive  time.Time
}

func NewSession(lobbyID string, playerIDs []uint, onMatchOver func(lobbyID string, winnerUserID *uint)) *Session {
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	health := make(map[uint]int, len(ids))
	for _, id := range ids {
		health[id] = StartHP
	}

	return &Session{
		lobbyID:     lobbyID,
		clients:     make(map[uint]*Client),
		playerOrder: ids,
		phase:       PhasePicking,
		round:       1,
		health:      health,
		picks:       make(map[uint]int),
		picked:      make(map[uint]bool),
		ready:       make(map[uint]bool),
		onMatchOver: onMatchOver,
		lastActive:  time.Now(),
	}
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	client := &Client{userID: userID, conn: conn}

	s.mu.Lock()
	if old := s.clients[userID]; old != nil {
		_ = old.conn.Close()
	}
	s.clients[userID] = client
	s.lastActive = time.Now()
	state := s.publicStateForLocked(userID, "state")
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

	conn.SetReadLimit(64 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})

	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()
	done := make(chan struct{})

	go func() {
		defer close(done)
		for range pingTicker.C {
			client.mu.Lock()
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second))
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
		case <-done:
			return nil
		default:
		}
	}
}

func (s *Session) Handle(userID uint, message ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.lastActive = time.Now()

	switch message.Type {
	case "state":
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
	case "pick":
		s.pickLocked(userID, message.Value)
	case "ready":
		s.readyLocked(userID)
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) pickLocked(userID uint, value int) {
	if s.phase != PhasePicking {
		s.sendErrorLocked(userID, "round is not accepting picks")
		return
	}
	if !containsPlayer(s.playerOrder, userID) {
		s.sendErrorLocked(userID, "user is not in match")
		return
	}
	if s.picked[userID] {
		s.sendErrorLocked(userID, "pick already locked")
		return
	}
	if value < MinNumber || value > MaxNumber {
		s.sendErrorLocked(userID, "pick must be between 1 and 100")
		return
	}

	s.picks[userID] = value
	s.picked[userID] = true

	if !s.allPickedLocked() {
		s.broadcastLocked("state")
		return
	}

	if err := s.beginSpinLocked(); err != nil {
		for _, id := range s.playerOrder {
			s.sendErrorLocked(id, "failed to start round")
		}
		return
	}
}

func (s *Session) beginSpinLocked() error {
	target, err := secureRandomInt(MinNumber, MaxNumber)
	if err != nil {
		return err
	}
	nonceBytes := make([]byte, 24)
	if _, err := rand.Read(nonceBytes); err != nil {
		return err
	}

	now := time.Now().UTC()
	s.target = target
	s.nonce = hex.EncodeToString(nonceBytes)
	s.commitment = roundCommitment(s.lobbyID, s.round, s.target, s.nonce)
	s.revealAt = now.Add(BlindSpinDuration)
	s.stopAt = s.revealAt.Add(LandingDuration)
	s.phase = PhaseSpinning
	s.outcome = nil
	s.ready = make(map[uint]bool)

	s.broadcastLocked("state")

	if s.revealTimer != nil {
		s.revealTimer.Stop()
	}
	s.revealTimer = time.AfterFunc(BlindSpinDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.beginLandingLocked()
	})

	return nil
}

func (s *Session) beginLandingLocked() {
	if s.phase != PhaseSpinning || !s.allPickedLocked() {
		return
	}

	s.phase = PhaseLanding
	s.broadcastLocked("state")

	if s.landingTimer != nil {
		s.landingTimer.Stop()
	}
	s.landingTimer = time.AfterFunc(LandingDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.finishLandingLocked()
	})
}

func (s *Session) finishLandingLocked() {
	if s.phase != PhaseLanding || !s.allPickedLocked() {
		return
	}

	outcome := calculateOutcome(s.playerOrder[0], s.picks[s.playerOrder[0]], s.playerOrder[1], s.picks[s.playerOrder[1]], s.target)
	s.outcome = &outcome

	if outcome.DefenderUserID != 0 && outcome.Damage > 0 {
		next := s.health[outcome.DefenderUserID] - outcome.Damage
		if next < 0 {
			next = 0
		}
		s.health[outcome.DefenderUserID] = next
	}

	s.phase = PhaseImpact
	s.broadcastLocked("state")

	if s.resultTimer != nil {
		s.resultTimer.Stop()
	}
	s.resultTimer = time.AfterFunc(ImpactDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.finishImpactLocked()
	})
}

func (s *Session) finishImpactLocked() {
	if s.phase != PhaseImpact {
		return
	}

	for _, id := range s.playerOrder {
		if s.health[id] <= 0 {
			s.finishMatchLocked(otherPlayer(s.playerOrder, id))
			return
		}
	}

	s.phase = PhaseResult
	s.ready = make(map[uint]bool)
	s.broadcastLocked("state")

	if s.autoNextTimer != nil {
		s.autoNextTimer.Stop()
	}
	s.autoNextTimer = time.AfterFunc(AutoNextRoundWait, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.phase == PhaseResult {
			s.startNextRoundLocked()
		}
	})
}

func (s *Session) readyLocked(userID uint) {
	if s.phase != PhaseResult {
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
		return
	}
	if !containsPlayer(s.playerOrder, userID) {
		s.sendErrorLocked(userID, "user is not in match")
		return
	}

	s.ready[userID] = true
	if s.allReadyLocked() {
		s.startNextRoundLocked()
		return
	}
	s.broadcastLocked("state")
}

func (s *Session) startNextRoundLocked() {
	if s.autoNextTimer != nil {
		s.autoNextTimer.Stop()
		s.autoNextTimer = nil
	}

	s.round++
	s.phase = PhasePicking
	s.picks = make(map[uint]int)
	s.picked = make(map[uint]bool)
	s.ready = make(map[uint]bool)
	s.target = 0
	s.nonce = ""
	s.commitment = ""
	s.revealAt = time.Time{}
	s.stopAt = time.Time{}
	s.outcome = nil
	s.broadcastLocked("state")
}

func (s *Session) finishMatchLocked(winnerUserID uint) {
	if s.matchClosed {
		return
	}

	s.stopTimersLocked()
	s.phase = PhaseMatchOver
	s.winnerUserID = winnerUserID
	s.matchClosed = true
	s.broadcastLocked("state")

	if s.onMatchOver != nil {
		lobbyID := s.lobbyID
		winner := winnerUserID
		callback := s.onMatchOver
		go callback(lobbyID, &winner)
	}
}

func (s *Session) publicStateForLocked(userID uint, messageType string) PublicState {
	health := make(map[uint]int, len(s.health))
	for id, value := range s.health {
		health[id] = value
	}

	picked := make(map[uint]bool, len(s.playerOrder))
	ready := make(map[uint]bool, len(s.playerOrder))
	picks := make(map[uint]*int, len(s.playerOrder))

	showAllPicks := s.phase != PhasePicking
	for _, id := range s.playerOrder {
		picked[id] = s.picked[id]
		ready[id] = s.ready[id]
		if !s.picked[id] {
			picks[id] = nil
			continue
		}
		if showAllPicks || id == userID {
			value := s.picks[id]
			picks[id] = &value
		} else {
			picks[id] = nil
		}
	}

	state := PublicState{
		Type:         messageType,
		Game:         GameCode,
		LobbyID:      s.lobbyID,
		Phase:        s.phase,
		Round:        s.round,
		ServerMS:     time.Now().UTC().UnixMilli(),
		PlayerOrder:  append([]uint(nil), s.playerOrder...),
		Health:       health,
		Picked:       picked,
		Picks:        picks,
		Ready:        ready,
		WinnerUserID: s.winnerUserID,
		Outcome:      cloneOutcome(s.outcome),
	}

	switch s.phase {
	case PhasePicking:
		if s.picked[userID] {
			state.Message = "Выбор сохранён. Ожидаем соперника."
		} else {
			state.Message = "Выберите число от 1 до 100."
		}
	case PhaseSpinning:
		state.Commitment = s.commitment
		state.RevealAtMS = s.revealAt.UnixMilli()
		state.StopAtMS = s.stopAt.UnixMilli()
		state.Message = "Оба выбора сохранены. Рулетка крутится."
	case PhaseLanding:
		state.Commitment = s.commitment
		state.RevealAtMS = s.revealAt.UnixMilli()
		state.StopAtMS = s.stopAt.UnixMilli()
		target := s.target
		state.Target = &target
		state.RevealNonce = s.nonce
		state.Message = "Рулетка замедляется."
	case PhaseImpact, PhaseResult, PhaseMatchOver:
		state.Commitment = s.commitment
		state.RevealAtMS = s.revealAt.UnixMilli()
		state.StopAtMS = s.stopAt.UnixMilli()
		target := s.target
		state.Target = &target
		state.RevealNonce = s.nonce
		if s.phase == PhaseImpact {
			state.Message = "Финальное число раскрыто."
		} else if s.phase == PhaseResult {
			if s.ready[userID] {
				state.Message = "Готово. Ожидаем соперника."
			} else {
				state.Message = "Раунд завершён."
			}
		} else {
			state.Message = "Матч завершён."
		}
	}

	return state
}

func (s *Session) broadcastLocked(messageType string) {
	for userID, client := range s.clients {
		_ = client.Send(s.publicStateForLocked(userID, messageType))
	}
}

func (s *Session) sendToLocked(userID uint, value any) {
	if client := s.clients[userID]; client != nil {
		_ = client.Send(value)
	}
}

func (s *Session) sendErrorLocked(userID uint, message string) {
	s.sendToLocked(userID, map[string]any{
		"type":  "error",
		"error": message,
	})
}

func (s *Session) allPickedLocked() bool {
	for _, id := range s.playerOrder {
		if !s.picked[id] {
			return false
		}
	}
	return true
}

func (s *Session) allReadyLocked() bool {
	for _, id := range s.playerOrder {
		if !s.ready[id] {
			return false
		}
	}
	return true
}

func (s *Session) stopTimersLocked() {
	if s.revealTimer != nil {
		s.revealTimer.Stop()
		s.revealTimer = nil
	}
	if s.landingTimer != nil {
		s.landingTimer.Stop()
		s.landingTimer = nil
	}
	if s.resultTimer != nil {
		s.resultTimer.Stop()
		s.resultTimer = nil
	}
	if s.autoNextTimer != nil {
		s.autoNextTimer.Stop()
		s.autoNextTimer = nil
	}
}

func calculateOutcome(player1ID uint, player1Pick int, player2ID uint, player2Pick int, target int) RoundOutcome {
	distance1 := circularDistance(player1Pick, target)
	distance2 := circularDistance(player2Pick, target)
	damage := abs(distance1 - distance2)

	outcome := RoundOutcome{
		Target:          target,
		Player1UserID:   player1ID,
		Player2UserID:   player2ID,
		Player1Pick:     player1Pick,
		Player2Pick:     player2Pick,
		Player1Distance: distance1,
		Player2Distance: distance2,
		Damage:          damage,
		IsDraw:          damage == 0,
	}

	if damage == 0 {
		return outcome
	}
	if distance1 < distance2 {
		outcome.AttackerUserID = player1ID
		outcome.DefenderUserID = player2ID
		outcome.WinnerUserID = player1ID
	} else {
		outcome.AttackerUserID = player2ID
		outcome.DefenderUserID = player1ID
		outcome.WinnerUserID = player2ID
	}
	return outcome
}

func roundCommitment(lobbyID string, round int, target int, nonce string) string {
	payload := fmt.Sprintf("%s:%d:%d:%s", lobbyID, round, target, nonce)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])
}

func secureRandomInt(minValue int, maxValue int) (int, error) {
	if maxValue < minValue {
		return 0, errors.New("invalid random range")
	}
	rangeSize := maxValue - minValue + 1
	if rangeSize <= 0 || rangeSize > 256 {
		return 0, errors.New("unsupported random range")
	}

	limit := 256 - (256 % rangeSize)
	buffer := []byte{0}
	for {
		if _, err := rand.Read(buffer); err != nil {
			return 0, err
		}
		if int(buffer[0]) < limit {
			return minValue + int(buffer[0])%rangeSize, nil
		}
	}
}

func circularDistance(a int, b int) int {
	direct := abs(a - b)
	circular := (MaxNumber - MinNumber + 1) - direct
	if circular < direct {
		return circular
	}
	return direct
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func containsPlayer(players []uint, userID uint) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}
	return false
}

func otherPlayer(players []uint, userID uint) uint {
	for _, id := range players {
		if id != userID {
			return id
		}
	}
	return 0
}

func cloneOutcome(value *RoundOutcome) *RoundOutcome {
	if value == nil {
		return nil
	}
	copyValue := *value
	return &copyValue
}