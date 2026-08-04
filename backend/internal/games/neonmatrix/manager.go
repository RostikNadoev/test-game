package neonmatrix

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"tg-lobbies-base/internal/matcheconomy"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode = "neon_matrix"

	StartHP        = 60
	MinNumber      = 1
	MaxNumber      = 100
	NoPickDistance = 51

	CountdownDuration    = 3 * time.Second
	PickDuration         = 5 * time.Second
	BlindSpinDuration    = 1800 * time.Millisecond
	LandingDuration      = 2200 * time.Millisecond
	DamageFlightDuration = 1550 * time.Millisecond
	PostDamageDuration   = 1050 * time.Millisecond

	PhaseWaiting   = "waiting"
	PhaseCountdown = "countdown"
	PhasePicking   = "picking"
	PhaseSpinning  = "spinning"
	PhaseLanding   = "landing"
	PhaseImpact    = "impact"
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
	Player1Pick     int  `json:"player1_pick,omitempty"`
	Player2Pick     int  `json:"player2_pick,omitempty"`
	Player1Picked   bool `json:"player1_picked"`
	Player2Picked   bool `json:"player2_picked"`
	Player1Distance int  `json:"player1_distance"`
	Player2Distance int  `json:"player2_distance"`
	Damage          int  `json:"damage"`
	AttackerUserID  uint `json:"attacker_user_id,omitempty"`
	DefenderUserID  uint `json:"defender_user_id,omitempty"`
	WinnerUserID    uint `json:"winner_user_id,omitempty"`
	IsDraw          bool `json:"is_draw"`
}

type PublicState struct {
	Type            string        `json:"type"`
	Game            string        `json:"game"`
	LobbyID         string        `json:"lobby_id"`
	Phase           string        `json:"phase"`
	Round           int           `json:"round"`
	ServerMS        int64         `json:"server_ms"`
	PlayerOrder     []uint        `json:"player_order"`
	Health          map[uint]int  `json:"health"`
	Picked          map[uint]bool `json:"picked"`
	Picks           map[uint]*int `json:"picks"`
	Commitment      string        `json:"commitment,omitempty"`
	CountdownEndsMS int64         `json:"countdown_ends_ms,omitempty"`
	PickEndsMS      int64         `json:"pick_ends_ms,omitempty"`
	RevealAtMS      int64         `json:"reveal_at_ms,omitempty"`
	StopAtMS        int64         `json:"stop_at_ms,omitempty"`
	DamageAtMS      int64         `json:"damage_at_ms,omitempty"`
	NextRoundAtMS   int64         `json:"next_round_at_ms,omitempty"`
	DamageApplied   bool          `json:"damage_applied"`
	Target          *int          `json:"target,omitempty"`
	RevealNonce     string        `json:"reveal_nonce,omitempty"`
	Outcome         *RoundOutcome `json:"outcome,omitempty"`
	WinnerUserID    uint          `json:"winner_user_id,omitempty"`
	BetCoins        float64       `json:"bet_coins"`
	WinnerProfit    float64       `json:"winner_profit"`
	Message         string        `json:"message,omitempty"`
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
		return errors.New("neon matrix requires exactly 2 players")
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

func (m *Manager) RemoveSession(lobbyID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if session := m.sessions[lobbyID]; session != nil {
		session.Close()
	}
	delete(m.sessions, lobbyID)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for now := range ticker.C {
		cutoff := now.Add(-45 * time.Minute)
		m.mu.Lock()
		for id, session := range m.sessions {
			session.mu.Lock()
			stale := session.lastActive.Before(cutoff)
			closed := session.matchClosed && now.Sub(session.lastActive) > 5*time.Minute
			session.mu.Unlock()
			if stale || closed {
				session.Close()
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
	betCoins    float64

	phase  string
	round  int
	health map[uint]int
	picks  map[uint]int
	picked map[uint]bool

	target        int
	nonce         string
	commitment    string
	countdownEnd  time.Time
	pickEnd       time.Time
	revealAt      time.Time
	stopAt        time.Time
	damageAt      time.Time
	nextRoundAt   time.Time
	outcome       *RoundOutcome
	damageApplied bool
	winnerUserID  uint

	countdownTimer *time.Timer
	pickTimer      *time.Timer
	revealTimer    *time.Timer
	landingTimer   *time.Timer
	damageTimer    *time.Timer
	resultTimer    *time.Timer

	onMatchOver func(lobbyID string, winnerUserID *uint)
	matchClosed bool
	paused      bool
	pauseRemaining time.Duration
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

	health := make(map[uint]int, len(ids))
	for _, id := range ids {
		health[id] = StartHP
	}

	return &Session{
		lobbyID:     lobbyID,
		clients:     make(map[uint]*Client),
		playerOrder: ids,
		betCoins:    math.Max(0, betCoins),
		phase:       PhaseWaiting,
		round:       1,
		health:      health,
		picks:       make(map[uint]int),
		picked:      make(map[uint]bool),
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

	if s.phase == PhaseWaiting && len(s.clients) == len(s.playerOrder) {
		s.startCountdownLocked()
	} else {
		_ = client.Send(s.publicStateForLocked(userID, "state"))
	}
	s.mu.Unlock()

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
	case "state", "ready":
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
	case "pick":
		if s.paused {
			return
		}
		s.pickLocked(userID, message.Value)
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) startCountdownLocked() {
	if s.phase != PhaseWaiting || s.matchClosed {
		return
	}

	s.phase = PhaseCountdown
	s.countdownEnd = time.Now().UTC().Add(CountdownDuration)
	s.broadcastLocked("state")

	stopTimer(&s.countdownTimer)
	s.countdownTimer = time.AfterFunc(CountdownDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused && s.phase == PhaseCountdown {
			s.startPickingLocked(false)
		}
	})
}

func (s *Session) startPickingLocked(nextRound bool) {
	if s.matchClosed {
		return
	}

	if nextRound {
		s.round++
	}

	stopTimer(&s.countdownTimer)
	stopTimer(&s.pickTimer)
	stopTimer(&s.revealTimer)
	stopTimer(&s.landingTimer)
	stopTimer(&s.damageTimer)
	stopTimer(&s.resultTimer)

	s.phase = PhasePicking
	s.picks = make(map[uint]int)
	s.picked = make(map[uint]bool)
	s.target = 0
	s.nonce = ""
	s.commitment = ""
	s.countdownEnd = time.Time{}
	s.revealAt = time.Time{}
	s.stopAt = time.Time{}
	s.damageAt = time.Time{}
	s.nextRoundAt = time.Time{}
	s.outcome = nil
	s.damageApplied = false
	s.pickEnd = time.Now().UTC().Add(PickDuration)
	s.broadcastLocked("state")

	s.pickTimer = time.AfterFunc(PickDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused && s.phase == PhasePicking {
			_ = s.beginSpinLocked()
		}
	})
}

func (s *Session) pickLocked(userID uint, value int) {
	if s.phase != PhasePicking {
		s.sendErrorLocked(userID, "round is not accepting picks")
		return
	}
	if !s.pickEnd.IsZero() && !time.Now().Before(s.pickEnd) {
		_ = s.beginSpinLocked()
		s.sendErrorLocked(userID, "pick time is over")
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

	if s.allPickedLocked() {
		if err := s.beginSpinLocked(); err != nil {
			for _, id := range s.playerOrder {
				s.sendErrorLocked(id, "failed to start round")
			}
		}
		return
	}

	s.broadcastLocked("state")
}

func (s *Session) beginSpinLocked() error {
	if s.phase != PhasePicking {
		return nil
	}

	target, err := secureRandomInt(MinNumber, MaxNumber)
	if err != nil {
		return err
	}
	nonceBytes := make([]byte, 24)
	if _, err := rand.Read(nonceBytes); err != nil {
		return err
	}

	stopTimer(&s.pickTimer)

	now := time.Now().UTC()
	s.target = target
	s.nonce = hex.EncodeToString(nonceBytes)
	s.commitment = roundCommitment(s.lobbyID, s.round, s.target, s.nonce)
	s.pickEnd = time.Time{}
	s.revealAt = now.Add(BlindSpinDuration)
	s.stopAt = s.revealAt.Add(LandingDuration)
	s.phase = PhaseSpinning
	s.outcome = nil
	s.damageApplied = false
	s.broadcastLocked("state")

	stopTimer(&s.revealTimer)
	s.revealTimer = time.AfterFunc(BlindSpinDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused {
			s.beginLandingLocked()
		}
	})

	return nil
}

func (s *Session) beginLandingLocked() {
	if s.phase != PhaseSpinning {
		return
	}

	s.phase = PhaseLanding
	s.broadcastLocked("state")

	stopTimer(&s.landingTimer)
	s.landingTimer = time.AfterFunc(LandingDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused {
			s.finishLandingLocked()
		}
	})
}

func (s *Session) finishLandingLocked() {
	if s.phase != PhaseLanding {
		return
	}

	player1 := s.playerOrder[0]
	player2 := s.playerOrder[1]
	outcome := calculateOutcome(
		player1,
		s.picks[player1],
		s.picked[player1],
		player2,
		s.picks[player2],
		s.picked[player2],
		s.target,
	)

	now := time.Now().UTC()
	s.outcome = &outcome
	s.phase = PhaseImpact
	s.damageApplied = false
	s.damageAt = now.Add(DamageFlightDuration)
	s.nextRoundAt = s.damageAt.Add(PostDamageDuration)
	s.broadcastLocked("state")

	stopTimer(&s.damageTimer)
	s.damageTimer = time.AfterFunc(DamageFlightDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused {
			s.applyDamageLocked()
		}
	})
}

func (s *Session) applyDamageLocked() {
	if s.phase != PhaseImpact || s.damageApplied || s.outcome == nil {
		return
	}

	if s.outcome.DefenderUserID != 0 && s.outcome.Damage > 0 {
		next := s.health[s.outcome.DefenderUserID] - s.outcome.Damage
		if next < 0 {
			next = 0
		}
		s.health[s.outcome.DefenderUserID] = next
	}

	s.damageApplied = true
	s.broadcastLocked("state")

	stopTimer(&s.resultTimer)
	s.resultTimer = time.AfterFunc(PostDamageDuration, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.paused {
			s.finishImpactLocked()
		}
	})
}

func (s *Session) finishImpactLocked() {
	if s.phase != PhaseImpact || !s.damageApplied {
		return
	}

	for _, id := range s.playerOrder {
		if s.health[id] <= 0 {
			s.finishMatchLocked(otherPlayer(s.playerOrder, id))
			return
		}
	}

	s.startPickingLocked(true)
}

func (s *Session) finishMatchLocked(winnerUserID uint) {
	if s.matchClosed {
		return
	}

	s.stopTimersLocked()
	s.phase = PhaseMatchOver
	s.winnerUserID = winnerUserID
	s.matchClosed = true
	s.nextRoundAt = time.Time{}
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
	picks := make(map[uint]*int, len(s.playerOrder))
	showAllPicks := s.phase != PhaseWaiting && s.phase != PhaseCountdown && s.phase != PhasePicking

	for _, id := range s.playerOrder {
		picked[id] = s.picked[id]
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
		Type:          messageType,
		Game:          GameCode,
		LobbyID:       s.lobbyID,
		Phase:         s.phase,
		Round:         s.round,
		ServerMS:      time.Now().UTC().UnixMilli(),
		PlayerOrder:   append([]uint(nil), s.playerOrder...),
		Health:        health,
		Picked:        picked,
		Picks:         picks,
		WinnerUserID:  s.winnerUserID,
		Outcome:       cloneOutcome(s.outcome),
		DamageApplied: s.damageApplied,
		BetCoins:      s.betCoins,
		WinnerProfit:  s.winnerProfitLocked(),
		Message:       s.messageLocked(userID),
	}

	if !s.countdownEnd.IsZero() {
		state.CountdownEndsMS = s.countdownEnd.UnixMilli()
	}
	if !s.pickEnd.IsZero() {
		state.PickEndsMS = s.pickEnd.UnixMilli()
	}
	if !s.revealAt.IsZero() {
		state.RevealAtMS = s.revealAt.UnixMilli()
	}
	if !s.stopAt.IsZero() {
		state.StopAtMS = s.stopAt.UnixMilli()
	}
	if !s.damageAt.IsZero() {
		state.DamageAtMS = s.damageAt.UnixMilli()
	}
	if !s.nextRoundAt.IsZero() {
		state.NextRoundAtMS = s.nextRoundAt.UnixMilli()
	}

	switch s.phase {
	case PhaseSpinning:
		state.Commitment = s.commitment
	case PhaseLanding, PhaseImpact, PhaseMatchOver:
		state.Commitment = s.commitment
		target := s.target
		state.Target = &target
		state.RevealNonce = s.nonce
	}

	return state
}

func (s *Session) messageLocked(userID uint) string {
	switch s.phase {
	case PhaseWaiting:
		return "Ждём второго игрока"
	case PhaseCountdown:
		return "Матч начинается"
	case PhasePicking:
		if s.picked[userID] {
			return "Выбор сохранён"
		}
		return "Выберите число"
	case PhaseSpinning:
		return "Колесо набирает скорость"
	case PhaseLanding:
		return "Колесо останавливается"
	case PhaseImpact:
		if s.damageApplied {
			return "Урон применён"
		}
		return "Сравниваем расстояния"
	case PhaseMatchOver:
		return "Матч завершён"
	default:
		return ""
	}
}

func (s *Session) winnerProfitLocked() float64 {
	if s.phase != PhaseMatchOver || s.winnerUserID == 0 {
		return 0
	}
	return matcheconomy.WinnerProfit(s.betCoins)
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

func (s *Session) stopTimersLocked() {
	stopTimer(&s.countdownTimer)
	stopTimer(&s.pickTimer)
	stopTimer(&s.revealTimer)
	stopTimer(&s.landingTimer)
	stopTimer(&s.damageTimer)
	stopTimer(&s.resultTimer)
}

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopTimersLocked()
	for _, client := range s.clients {
		_ = client.conn.Close()
	}
	s.clients = make(map[uint]*Client)
}

func calculateOutcome(
	player1ID uint,
	player1Pick int,
	player1Picked bool,
	player2ID uint,
	player2Pick int,
	player2Picked bool,
	target int,
) RoundOutcome {
	distance1 := NoPickDistance
	distance2 := NoPickDistance
	if player1Picked {
		distance1 = circularDistance(player1Pick, target)
	}
	if player2Picked {
		distance2 = circularDistance(player2Pick, target)
	}

	outcome := RoundOutcome{
		Target:          target,
		Player1UserID:   player1ID,
		Player2UserID:   player2ID,
		Player1Pick:     player1Pick,
		Player2Pick:     player2Pick,
		Player1Picked:   player1Picked,
		Player2Picked:   player2Picked,
		Player1Distance: distance1,
		Player2Distance: distance2,
		Damage:          abs(distance1 - distance2),
	}

	if !player1Picked && !player2Picked {
		outcome.Damage = 0
		outcome.IsDraw = true
		return outcome
	}
	if outcome.Damage == 0 {
		outcome.IsDraw = true
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

func stopTimer(timer **time.Timer) {
	if *timer != nil {
		(*timer).Stop()
		*timer = nil
	}
}

func roundToTwo(value float64) float64 {
	return math.Round(value*100) / 100
}
