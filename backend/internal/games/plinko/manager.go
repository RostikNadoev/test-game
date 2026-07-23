package plinko

import (
	crand "crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode         = "plinko_pvp"
	CountdownSeconds = 3
	AngleSeconds     = 15
	ActionSeconds    = 15
	RevealMaxSeconds = 70
	BallsPerPlayer   = 5
	ActionsPerPlayer = 2
	NSlots           = 10
	Rows             = 9
	TopPegs          = 3
	WallMinRow       = 3
	WorldWidth       = 360.0
	topY             = 64.0
	sy               = 43.0
	sx               = 30.0
	pegR             = 5.0
	ballR            = 6.5
	wallL            = 10.0
	wallR            = 350.0
	floorY           = 494.0
	slotTop          = 448.0
	gravity          = 760.0
	restitution      = 0.48
	wallRestitution  = 0.4
	air              = 0.999
	dt               = 1.0 / 240.0
	maxSteps         = 9000
	dropY            = 48.0
	dropOffset       = 0.6
	launchVX         = 120.0
	launchVY         = 20.0
	pegFriction      = 0.06
	windMax          = 0.16
	loopInterval     = 100 * time.Millisecond
	stateInterval    = 1 * time.Second
	cleanupAfter     = 10 * time.Minute
)

var baseValues = []float64{9, 6, 3.5, 2, 1.2, 1.1, 1.8, 3.2, 5.5, 8.5}

type Phase string

const (
	PhaseWaiting   Phase = "waiting"
	PhaseCountdown Phase = "countdown"
	PhaseAngles    Phase = "angles"
	PhaseActions   Phase = "actions"
	PhaseReveal    Phase = "reveal"
	PhaseMatchOver Phase = "match_over"
)

type ActionMode string

const (
	ActionX2   ActionMode = "x2"
	ActionHalf ActionMode = "half"
	ActionWall ActionMode = "wall"
)

type Point struct {
	X float64
	Y float64
}

type Peg struct {
	X   float64
	Y   float64
	Row int
	Col int
}

type Seg struct {
	AX float64
	AY float64
	BX float64
	BY float64
}

type Gap struct {
	Seg
	Row int
	Idx int
	MX  float64
	MY  float64
}

type Board struct {
	Pegs     []Peg
	Dividers []float64
	Posts    []float64
	Gaps     map[string]Gap
}

var gameBoard = buildBoard()

type PlayerState struct {
	UserID           uint      `json:"user_id"`
	Angles           []float64 `json:"angles,omitempty"`
	AngleSet         []bool    `json:"-"`
	AnglesCount      int       `json:"angles_count"`
	AnglesSubmitted  bool      `json:"angles_submitted"`
	Factors          []float64 `json:"factors,omitempty"`
	Walls            []string  `json:"walls,omitempty"`
	ActionsUsed      int       `json:"actions_used"`
	ActionsSubmitted bool      `json:"actions_submitted"`
	RevealDone       bool      `json:"reveal_done,omitempty"`
	Score            float64   `json:"score"`
}

type RevealBall struct {
	Index      int     `json:"index"`
	UserID     uint    `json:"user_id"`
	BallIndex  int     `json:"ball_index"`
	Angle      float64 `json:"angle"`
	Slot       int     `json:"slot"`
	Value      float64 `json:"value"`
	Stuck      bool    `json:"stuck"`
	ScoreAfter float64 `json:"score_after"`
}

type PublicState struct {
	Type             string               `json:"type"`
	Game             string               `json:"game"`
	LobbyID          string               `json:"lobby_id"`
	Phase            Phase                `json:"phase"`
	Ready            bool                 `json:"ready"`
	ServerMS         int64                `json:"server_ms"`
	Revision         uint64               `json:"revision"`
	StartAtMS        int64                `json:"start_at_ms,omitempty"`
	DeadlineMS       int64                `json:"deadline_ms,omitempty"`
	CountdownSeconds int                  `json:"countdown_seconds"`
	AngleSeconds     int                  `json:"angle_seconds"`
	ActionSeconds    int                  `json:"action_seconds"`
	BallsPerPlayer   int                  `json:"balls_per_player"`
	ActionsPerPlayer int                  `json:"actions_per_player"`
	PlayerOrder      []uint               `json:"player_order"`
	Players          map[uint]PlayerState `json:"players"`
	Values           []float64            `json:"values,omitempty"`
	Wind             *float64             `json:"wind,omitempty"`
	CombinedValues   []float64            `json:"combined_values,omitempty"`
	AllWalls         []string             `json:"all_walls,omitempty"`
	Reveal           []RevealBall         `json:"reveal,omitempty"`
	WinnerUserID     *uint                `json:"winner_user_id,omitempty"`
	Message          string               `json:"message,omitempty"`
}

type ClientMessage struct {
	Type      string     `json:"type"`
	BallIndex int        `json:"ball_index,omitempty"`
	Angle     float64    `json:"angle,omitempty"`
	Mode      ActionMode `json:"mode,omitempty"`
	SlotIndex int        `json:"slot_index,omitempty"`
	WallKey   string     `json:"wall_key,omitempty"`
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
	if strings.TrimSpace(lobbyID) == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("plinko requires exactly 2 players")
	}
	if !contains(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	m.mu.Lock()
	s := m.sessions[lobbyID]
	if s == nil {
		s = newSession(lobbyID, ids, m.onMatchOver)
		m.sessions[lobbyID] = s
	}
	m.mu.Unlock()

	return s.Attach(userID, conn)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for now := range ticker.C {
		m.mu.Lock()
		for id, session := range m.sessions {
			if session.Expired(now) {
				session.Close()
				delete(m.sessions, id)
			}
		}
		m.mu.Unlock()
	}
}

type client struct {
	userID uint
	conn   *websocket.Conn
	mu     sync.Mutex
}

func (c *client) Send(value any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(6 * time.Second))
	return c.conn.WriteJSON(value)
}

type Session struct {
	mu sync.Mutex

	lobbyID       string
	playerOrder   []uint
	clients       map[uint]*client
	ready         map[uint]bool
	players       map[uint]*PlayerState
	phase         Phase
	startAt       time.Time
	deadline      time.Time
	values        []float64
	wind          float64
	combined      []float64
	allWalls      []string
	reveal        []RevealBall
	winner        *uint
	finished      bool
	settled       bool
	closed        bool
	lastActive    time.Time
	loopStop      chan struct{}
	loopDone      chan struct{}
	loopStarted   bool
	onMatchOver   func(lobbyID string, winnerUserID *uint)
	lastBroadcast time.Time
	revision      uint64
}

func newSession(lobbyID string, ids []uint, onMatchOver func(string, *uint)) *Session {
	players := make(map[uint]*PlayerState, len(ids))
	for _, id := range ids {
		players[id] = initialPlayer(id)
	}

	return &Session{
		lobbyID:     lobbyID,
		playerOrder: append([]uint(nil), ids...),
		clients:     make(map[uint]*client),
		ready:       make(map[uint]bool),
		players:     players,
		phase:       PhaseWaiting,
		lastActive:  time.Now(),
		loopStop:    make(chan struct{}),
		loopDone:    make(chan struct{}),
		onMatchOver: onMatchOver,
	}
}

func initialPlayer(userID uint) *PlayerState {
	return &PlayerState{
		UserID:   userID,
		Angles:   make([]float64, BallsPerPlayer),
		AngleSet: make([]bool, BallsPerPlayer),
		Factors:  ones(NSlots),
		Walls:    make([]string, 0, ActionsPerPlayer),
		Score:    1,
	}
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	cl := &client{userID: userID, conn: conn}

	s.mu.Lock()
	if old := s.clients[userID]; old != nil {
		_ = old.conn.Close()
	}
	s.clients[userID] = cl
	s.lastActive = time.Now()
	state := s.publicStateForLocked(userID, "connected")
	s.mu.Unlock()

	_ = cl.Send(state)

	defer func() {
		s.mu.Lock()
		if s.clients[userID] == cl {
			delete(s.clients, userID)
		}
		s.lastActive = time.Now()
		s.mu.Unlock()
		_ = conn.Close()
	}()

	conn.SetReadLimit(32 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	})

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	pingDone := make(chan struct{})
	go func() {
		defer close(pingDone)
		for range ping.C {
			cl.mu.Lock()
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second))
			cl.mu.Unlock()
			if err != nil {
				_ = conn.Close()
				return
			}
		}
	}()

	for {
		var msg ClientMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return nil
		}
		s.Handle(userID, msg)
		select {
		case <-pingDone:
			return nil
		default:
		}
	}
}

func (s *Session) Handle(userID uint, msg ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.lastActive = now
	s.updatePhaseLocked(now)

	switch msg.Type {
	case "state":
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
	case "ready":
		if s.phase != PhaseWaiting {
			s.sendToLocked(userID, s.publicStateForLocked(userID, "already started"))
			return
		}
		s.ready[userID] = true
		if len(s.clients) == len(s.playerOrder) && s.allReadyLocked() {
			s.startCountdownLocked(now)
		} else {
			s.broadcastStateLocked("ready")
		}
	case "angle":
		s.setAngleLocked(userID, msg.BallIndex, msg.Angle, now)
	case "submit_angles":
		s.submitAnglesLocked(userID, now)
	case "action":
		s.applyActionLocked(userID, msg, now)
	case "submit_actions":
		s.submitActionsLocked(userID, now)
	case "reveal_done":
		s.revealDoneLocked(userID, now)
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) startCountdownLocked(now time.Time) {
	if s.phase != PhaseWaiting {
		return
	}

	s.phase = PhaseCountdown
	s.startAt = now.Add(CountdownSeconds * time.Second)
	s.deadline = s.startAt
	s.lastBroadcast = time.Time{}
	s.values = shuffledValues()
	s.wind = randomWind()
	s.combined = nil
	s.allWalls = nil
	s.reveal = nil
	s.winner = nil
	s.finished = false
	s.settled = false
	for _, id := range s.playerOrder {
		s.players[id] = initialPlayer(id)
	}

	if !s.loopStarted {
		s.loopStarted = true
		go s.loop()
	}
	s.broadcastStateLocked("countdown")
}

func (s *Session) loop() {
	ticker := time.NewTicker(loopInterval)
	defer ticker.Stop()
	defer close(s.loopDone)

	for {
		select {
		case <-s.loopStop:
			return
		case now := <-ticker.C:
			s.mu.Lock()
			if s.closed {
				s.mu.Unlock()
				return
			}
			s.updatePhaseLocked(now)
			if s.lastBroadcast.IsZero() || now.Sub(s.lastBroadcast) >= stateInterval {
				s.lastBroadcast = now
				s.broadcastStateLocked("")
			}
			done := s.finished
			s.mu.Unlock()
			if done {
				return
			}
		}
	}
}

func (s *Session) updatePhaseLocked(now time.Time) {
	switch s.phase {
	case PhaseCountdown:
		if !now.Before(s.startAt) {
			s.enterAnglesLocked(now)
		}
	case PhaseAngles:
		if !now.Before(s.deadline) {
			s.enterActionsLocked(now)
		}
	case PhaseActions:
		if !now.Before(s.deadline) {
			s.enterRevealLocked(now)
		}
	case PhaseReveal:
		if !now.Before(s.deadline) {
			s.finishLocked()
		}
	}
}

func (s *Session) enterAnglesLocked(now time.Time) {
	if s.phase != PhaseCountdown {
		return
	}
	s.phase = PhaseAngles
	s.deadline = now.Add(AngleSeconds * time.Second)
	s.broadcastStateLocked("angles")
}

func (s *Session) enterActionsLocked(now time.Time) {
	if s.phase != PhaseAngles {
		return
	}
	for _, id := range s.playerOrder {
		p := s.players[id]
		if p == nil {
			continue
		}
		for i := 0; i < BallsPerPlayer; i++ {
			if !p.AngleSet[i] {
				p.Angles[i] = 0
				p.AngleSet[i] = true
			}
		}
		p.AnglesCount = BallsPerPlayer
		p.AnglesSubmitted = true
	}
	s.phase = PhaseActions
	s.deadline = now.Add(ActionSeconds * time.Second)
	s.broadcastStateLocked("actions")
}

func (s *Session) enterRevealLocked(now time.Time) {
	if s.phase != PhaseActions {
		return
	}
	for _, id := range s.playerOrder {
		if p := s.players[id]; p != nil {
			p.ActionsSubmitted = true
		}
	}

	s.combined = make([]float64, NSlots)
	for i := 0; i < NSlots; i++ {
		value := s.values[i]
		for _, id := range s.playerOrder {
			if p := s.players[id]; p != nil && len(p.Factors) == NSlots {
				value *= p.Factors[i]
			}
		}
		s.combined[i] = round2(value)
	}

	wallSet := make(map[string]struct{})
	for _, id := range s.playerOrder {
		if p := s.players[id]; p != nil {
			for _, key := range p.Walls {
				wallSet[key] = struct{}{}
			}
		}
	}
	s.allWalls = make([]string, 0, len(wallSet))
	for key := range wallSet {
		s.allWalls = append(s.allWalls, key)
	}
	sort.Strings(s.allWalls)

	wallSegs := wallSegments(s.allWalls)
	scores := map[uint]float64{}
	for _, id := range s.playerOrder {
		scores[id] = 1
	}

	s.reveal = make([]RevealBall, 0, BallsPerPlayer*len(s.playerOrder))
	idx := 0
	for ball := 0; ball < BallsPerPlayer; ball++ {
		for _, id := range s.playerOrder {
			p := s.players[id]
			angle := clamp(p.Angles[ball]+s.wind, -1, 1)
			result := simulate(angle, gameBoard, wallSegs)
			value := 1.0
			if !result.Stuck {
				value = s.combined[result.Slot]
			}
			scores[id] = round2(scores[id] * value)
			s.reveal = append(s.reveal, RevealBall{
				Index:      idx,
				UserID:     id,
				BallIndex:  ball,
				Angle:      p.Angles[ball],
				Slot:       result.Slot,
				Value:      value,
				Stuck:      result.Stuck,
				ScoreAfter: scores[id],
			})
			idx++
		}
	}

	for _, id := range s.playerOrder {
		if p := s.players[id]; p != nil {
			p.Score = scores[id]
			p.RevealDone = false
		}
	}

	firstID := s.playerOrder[0]
	secondID := s.playerOrder[1]
	firstScore := scores[firstID]
	secondScore := scores[secondID]
	if firstScore > secondScore {
		winner := firstID
		s.winner = &winner
	} else if secondScore > firstScore {
		winner := secondID
		s.winner = &winner
	} else {
		s.winner = nil
	}

	s.phase = PhaseReveal
	s.deadline = now.Add(RevealMaxSeconds * time.Second)
	s.broadcastStateLocked("reveal")
}

func (s *Session) setAngleLocked(userID uint, ballIndex int, angle float64, now time.Time) {
	if s.phase != PhaseAngles || !now.Before(s.deadline) {
		s.sendErrorLocked(userID, "angle phase is closed")
		return
	}
	p := s.players[userID]
	if p == nil {
		s.sendErrorLocked(userID, "player is not in match")
		return
	}
	if p.AnglesSubmitted {
		s.sendErrorLocked(userID, "angles already submitted")
		return
	}
	if ballIndex < 0 || ballIndex >= BallsPerPlayer {
		s.sendErrorLocked(userID, "invalid ball_index")
		return
	}
	if math.IsNaN(angle) || math.IsInf(angle, 0) {
		s.sendErrorLocked(userID, "invalid angle")
		return
	}

	angle = round3(clamp(angle, -1, 1))
	if !p.AngleSet[ballIndex] {
		p.AngleSet[ballIndex] = true
		p.AnglesCount++
	}
	p.Angles[ballIndex] = angle
	if p.AnglesCount >= BallsPerPlayer {
		p.AnglesSubmitted = true
	}

	s.broadcastStateLocked("angle")
	if s.allAnglesSubmittedLocked() {
		s.enterActionsLocked(now)
	}
}

func (s *Session) submitAnglesLocked(userID uint, now time.Time) {
	if s.phase != PhaseAngles {
		return
	}
	p := s.players[userID]
	if p == nil {
		return
	}
	for i := 0; i < BallsPerPlayer; i++ {
		if !p.AngleSet[i] {
			p.Angles[i] = 0
			p.AngleSet[i] = true
		}
	}
	p.AnglesCount = BallsPerPlayer
	p.AnglesSubmitted = true
	s.broadcastStateLocked("angles submitted")
	if s.allAnglesSubmittedLocked() {
		s.enterActionsLocked(now)
	}
}

func (s *Session) applyActionLocked(userID uint, msg ClientMessage, now time.Time) {
	if s.phase != PhaseActions || !now.Before(s.deadline) {
		s.sendErrorLocked(userID, "action phase is closed")
		return
	}
	p := s.players[userID]
	if p == nil {
		s.sendErrorLocked(userID, "player is not in match")
		return
	}
	if p.ActionsSubmitted || p.ActionsUsed >= ActionsPerPlayer {
		s.sendErrorLocked(userID, "no actions left")
		return
	}

	switch msg.Mode {
	case ActionX2, ActionHalf:
		if msg.SlotIndex < 0 || msg.SlotIndex >= NSlots {
			s.sendErrorLocked(userID, "invalid slot_index")
			return
		}
		factor := 2.0
		if msg.Mode == ActionHalf {
			factor = 0.5
		}
		p.Factors[msg.SlotIndex] = round2(p.Factors[msg.SlotIndex] * factor)
	case ActionWall:
		key := strings.TrimSpace(msg.WallKey)
		if _, ok := gameBoard.Gaps[key]; !ok {
			s.sendErrorLocked(userID, "invalid wall_key")
			return
		}
		for _, existing := range p.Walls {
			if existing == key {
				s.sendErrorLocked(userID, "wall already selected")
				return
			}
		}
		p.Walls = append(p.Walls, key)
	default:
		s.sendErrorLocked(userID, "invalid action mode")
		return
	}

	p.ActionsUsed++
	if p.ActionsUsed >= ActionsPerPlayer {
		p.ActionsSubmitted = true
	}
	s.broadcastStateLocked("action")
	if s.allActionsSubmittedLocked() {
		s.enterRevealLocked(now)
	}
}

func (s *Session) submitActionsLocked(userID uint, now time.Time) {
	if s.phase != PhaseActions {
		return
	}
	if p := s.players[userID]; p != nil {
		p.ActionsSubmitted = true
	}
	s.broadcastStateLocked("actions submitted")
	if s.allActionsSubmittedLocked() {
		s.enterRevealLocked(now)
	}
}

func (s *Session) revealDoneLocked(userID uint, now time.Time) {
	if s.phase != PhaseReveal {
		return
	}
	if p := s.players[userID]; p != nil {
		p.RevealDone = true
	}
	s.broadcastStateLocked("reveal done")
	if s.allRevealDoneLocked() {
		s.finishLocked()
	}
}

func (s *Session) finishLocked() {
	if s.finished {
		return
	}
	s.finished = true
	s.phase = PhaseMatchOver
	s.deadline = time.Time{}
	s.broadcastStateLocked("match over")

	if s.onMatchOver != nil && !s.settled {
		s.settled = true
		lobbyID := s.lobbyID
		winner := cloneUintPtr(s.winner)
		callback := s.onMatchOver
		go callback(lobbyID, winner)
	}
}

func (s *Session) publicStateForLocked(userID uint, message string) PublicState {
	players := make(map[uint]PlayerState, len(s.players))
	for id, state := range s.players {
		copyState := *state
		copyState.Angles = nil
		copyState.Factors = nil
		copyState.Walls = nil
		copyState.AngleSet = nil

		switch s.phase {
		case PhaseAngles:
			if id == userID {
				copyState.Angles = append([]float64(nil), state.Angles...)
			}
		case PhaseActions:
			if id == userID {
				copyState.Angles = append([]float64(nil), state.Angles...)
				copyState.Factors = append([]float64(nil), state.Factors...)
				copyState.Walls = append([]string(nil), state.Walls...)
			}
		case PhaseReveal, PhaseMatchOver:
			copyState.Angles = append([]float64(nil), state.Angles...)
			copyState.Factors = append([]float64(nil), state.Factors...)
			copyState.Walls = append([]string(nil), state.Walls...)
		}
		players[id] = copyState
	}

	state := PublicState{
		Type:             "state",
		Game:             GameCode,
		LobbyID:          s.lobbyID,
		Phase:            s.phase,
		Ready:            s.allReadyLocked(),
		ServerMS:         time.Now().UnixMilli(),
		Revision:         s.revision,
		StartAtMS:        millis(s.startAt),
		DeadlineMS:       millis(s.deadline),
		CountdownSeconds: CountdownSeconds,
		AngleSeconds:     AngleSeconds,
		ActionSeconds:    ActionSeconds,
		BallsPerPlayer:   BallsPerPlayer,
		ActionsPerPlayer: ActionsPerPlayer,
		PlayerOrder:      append([]uint(nil), s.playerOrder...),
		Players:          players,
		Message:          message,
	}

	if s.phase == PhaseActions || s.phase == PhaseReveal || s.phase == PhaseMatchOver {
		state.Values = append([]float64(nil), s.values...)
	}
	if s.phase == PhaseReveal || s.phase == PhaseMatchOver {
		wind := s.wind
		state.Wind = &wind
		state.CombinedValues = append([]float64(nil), s.combined...)
		state.AllWalls = append([]string(nil), s.allWalls...)
		state.Reveal = append([]RevealBall(nil), s.reveal...)
	}
	if s.phase == PhaseMatchOver {
		state.WinnerUserID = cloneUintPtr(s.winner)
	}
	return state
}

func (s *Session) allReadyLocked() bool {
	for _, id := range s.playerOrder {
		if !s.ready[id] {
			return false
		}
	}
	return true
}

func (s *Session) allAnglesSubmittedLocked() bool {
	for _, id := range s.playerOrder {
		p := s.players[id]
		if p == nil || !p.AnglesSubmitted {
			return false
		}
	}
	return true
}

func (s *Session) allActionsSubmittedLocked() bool {
	for _, id := range s.playerOrder {
		p := s.players[id]
		if p == nil || !p.ActionsSubmitted {
			return false
		}
	}
	return true
}

func (s *Session) allRevealDoneLocked() bool {
	for _, id := range s.playerOrder {
		p := s.players[id]
		if p == nil || !p.RevealDone {
			return false
		}
	}
	return true
}

func (s *Session) sendToLocked(userID uint, payload any) {
	if cl := s.clients[userID]; cl != nil {
		go func() { _ = cl.Send(payload) }()
	}
}

func (s *Session) sendErrorLocked(userID uint, message string) {
	s.sendToLocked(userID, map[string]any{"type": "error", "error": message})
}

func (s *Session) broadcastStateLocked(message string) {
	// Every broadcast gets a monotonically increasing revision. WebSocket writes
	// are intentionally asynchronous, so packets from two consecutive states
	// can arrive out of order on a client. The frontend ignores an older revision
	// instead of visually rolling the match back (for example match_over -> reveal).
	s.revision++
	for userID, cl := range s.clients {
		payload := s.publicStateForLocked(userID, message)
		clientCopy := cl
		go func() { _ = clientCopy.Send(payload) }()
	}
}

func (s *Session) Expired(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.finished && now.Sub(s.lastActive) > cleanupAfter
}

func (s *Session) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	if s.loopStarted {
		close(s.loopStop)
	}
	clients := make([]*client, 0, len(s.clients))
	for _, cl := range s.clients {
		clients = append(clients, cl)
	}
	s.mu.Unlock()

	for _, cl := range clients {
		_ = cl.conn.Close()
	}
}

type simulationResult struct {
	Slot  int
	Stuck bool
}

func simulate(angleNorm float64, board Board, userWalls []Seg) simulationResult {
	x := WorldWidth/2 + dropOffset
	y := dropY
	vx := angleNorm * launchVX
	vy := launchVY
	settle := 0

	for step := 0; step < maxSteps; step++ {
		vy += gravity * dt
		vx *= air
		vy *= air
		x += vx * dt
		y += vy * dt

		for _, p := range board.Pegs {
			dx := x - p.X
			dy := y - p.Y
			md := ballR + pegR
			d2 := dx*dx + dy*dy
			if d2 < md*md && d2 > 1e-12 {
				d := math.Sqrt(d2)
				nx := dx / d
				ny := dy / d
				x += nx * (md - d)
				y += ny * (md - d)
				vn := vx*nx + vy*ny
				if vn < 0 {
					vx -= (1 + restitution) * vn * nx
					vy -= (1 + restitution) * vn * ny
					tx := -ny
					ty := nx
					vt := vx*tx + vy*ty
					vx -= pegFriction * vt * tx
					vy -= pegFriction * vt * ty
				}
			}
		}

		for _, w := range userWalls {
			cx, cy := closestOnSeg(x, y, w.AX, w.AY, w.BX, w.BY)
			dx := x - cx
			dy := y - cy
			md := ballR + 3.5
			d2 := dx*dx + dy*dy
			if d2 < md*md && d2 > 1e-12 {
				d := math.Sqrt(d2)
				nx := dx / d
				ny := dy / d
				x += nx * (md - d)
				y += ny * (md - d)
				vn := vx*nx + vy*ny
				if vn < 0 {
					vx -= (1 + restitution) * vn * nx
					vy -= (1 + restitution) * vn * ny
				}
			}
		}

		if x-ballR < wallL {
			x = wallL + ballR
			if vx < 0 {
				vx = -vx * wallRestitution
			}
		}
		if x+ballR > wallR {
			x = wallR - ballR
			if vx > 0 {
				vx = -vx * wallRestitution
			}
		}

		if y+ballR > slotTop-12 {
			for _, dvx := range board.Posts {
				tdx := x - dvx
				tdy := y - slotTop
				md := ballR + 2.5
				td2 := tdx*tdx + tdy*tdy
				if tdy < 0 && td2 < md*md && td2 > 1e-12 {
					d := math.Sqrt(td2)
					nx := tdx / d
					ny := tdy / d
					x += nx * (md - d)
					y += ny * (md - d)
					vn := vx*nx + vy*ny
					if vn < 0 {
						vx -= (1 + restitution) * vn * nx
						vy -= (1 + restitution) * vn * ny
					}
				}
				if y >= slotTop && math.Abs(x-dvx) < ballR+2.5 {
					if x < dvx {
						x = dvx - (ballR + 2.5)
						if vx > 0 {
							vx = -vx * wallRestitution
						}
					} else {
						x = dvx + (ballR + 2.5)
						if vx < 0 {
							vx = -vx * wallRestitution
						}
					}
				}
			}
		}

		if y+ballR > floorY {
			y = floorY - ballR
			if vy > 0 {
				vy = -vy * 0.18
			}
			vx *= 0.7
		}

		if y > slotTop+6 && math.Abs(vx) < 5 && math.Abs(vy) < 8 {
			settle++
			if settle > 40 {
				break
			}
		} else {
			settle = 0
		}
	}

	slot := NSlots - 1
	for i := 0; i < len(board.Dividers)-1; i++ {
		if x >= board.Dividers[i] && x < board.Dividers[i+1] {
			slot = i
			break
		}
	}
	if x < board.Dividers[0] {
		slot = 0
	}
	slot = int(clamp(float64(slot), 0, NSlots-1))
	return simulationResult{Slot: slot, Stuck: y < slotTop+6}
}

func buildBoard() Board {
	pegs := make([]Peg, 0, 64)
	for r := 0; r < Rows; r++ {
		n := TopPegs + r
		w := float64(n-1) * sx
		left := WorldWidth/2 - w/2
		for col := 0; col < n; col++ {
			pegs = append(pegs, Peg{X: left + float64(col)*sx, Y: topY + float64(r)*sy, Row: r, Col: col})
		}
	}

	dividers := make([]float64, 0, NSlots+1)
	for i := 0; i <= NSlots; i++ {
		dividers = append(dividers, wallL+((wallR-wallL)*float64(i))/NSlots)
	}
	posts := append([]float64(nil), dividers[1:len(dividers)-1]...)
	gaps := make(map[string]Gap)
	for r := WallMinRow; r < Rows; r++ {
		row := make([]Peg, 0)
		for _, peg := range pegs {
			if peg.Row == r {
				row = append(row, peg)
			}
		}
		sort.Slice(row, func(i, j int) bool { return row[i].X < row[j].X })
		for i := 0; i < len(row)-1; i++ {
			a := row[i]
			b := row[i+1]
			key := fmt.Sprintf("%d:%d", r, i)
			gaps[key] = Gap{
				Seg: Seg{AX: a.X, AY: a.Y, BX: b.X, BY: b.Y},
				Row: r,
				Idx: i,
				MX:  (a.X + b.X) / 2,
				MY:  (a.Y + b.Y) / 2,
			}
		}
	}

	return Board{Pegs: pegs, Dividers: dividers, Posts: posts, Gaps: gaps}
}

func wallSegments(keys []string) []Seg {
	segments := make([]Seg, 0, len(keys))
	for _, key := range keys {
		if gap, ok := gameBoard.Gaps[key]; ok {
			segments = append(segments, gap.Seg)
		}
	}
	return segments
}

func closestOnSeg(px, py, ax, ay, bx, by float64) (float64, float64) {
	dx := bx - ax
	dy := by - ay
	l2 := dx*dx + dy*dy
	if l2 < 1e-9 {
		return ax, ay
	}
	t := ((px-ax)*dx + (py-ay)*dy) / l2
	t = clamp(t, 0, 1)
	return ax + t*dx, ay + t*dy
}

func shuffledValues() []float64 {
	values := append([]float64(nil), baseValues...)
	r := secureRand()
	r.Shuffle(len(values), func(i, j int) {
		values[i], values[j] = values[j], values[i]
	})
	return values
}

func randomWind() float64 {
	r := secureRand()
	return round3((r.Float64()*2 - 1) * windMax)
}

func secureRand() *rand.Rand {
	var raw [8]byte
	if _, err := crand.Read(raw[:]); err == nil {
		seed := int64(binary.LittleEndian.Uint64(raw[:]))
		return rand.New(rand.NewSource(seed))
	}
	return rand.New(rand.NewSource(time.Now().UnixNano()))
}

func contains(ids []uint, id uint) bool {
	for _, candidate := range ids {
		if candidate == id {
			return true
		}
	}
	return false
}

func ones(n int) []float64 {
	values := make([]float64, n)
	for i := range values {
		values[i] = 1
	}
	return values
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func millis(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}

func cloneUintPtr(value *uint) *uint {
	if value == nil {
		return nil
	}
	copyValue := *value
	return &copyValue
}

// ParseWallKey is exported only for tests/debug helpers and keeps the key format explicit.
func ParseWallKey(key string) (row int, idx int, ok bool) {
	parts := strings.Split(strings.TrimSpace(key), ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	row, errRow := strconv.Atoi(parts[0])
	idx, errIdx := strconv.Atoi(parts[1])
	if errRow != nil || errIdx != nil {
		return 0, 0, false
	}
	_, ok = gameBoard.Gaps[key]
	return row, idx, ok
}
