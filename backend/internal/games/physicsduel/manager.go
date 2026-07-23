package physicsduel

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode         = "descent_duel"
	TotalTurns       = 15
	PrepSeconds      = 5
	CountdownSeconds = 3

	fixedDT       = 1.0 / 120.0
	maxResolveSec = 10.5
	solverIters   = 6

	gravity     = 2100.0
	airDrag     = 0.018
	angAirDrag  = 0.2
	rollRes     = 0.12
	restitution = 0.12
	friction    = 0.34

	minLaunch       = 255.0
	maxLaunch       = 1120.0
	angleMin        = 22.0 * math.Pi / 180.0
	angleMax        = 76.0 * math.Pi / 180.0
	defaultAngle    = 52.0 * math.Pi / 180.0
	defaultSpeed    = 500.0
	minLaunchSpin   = 1.65
	launchSpinPower = 0.026

	slop = 0.5
	corr = 0.6

	speedEPS  = 12.0
	angEPS    = 0.34
	stillTime = 0.46

	cubeSize   = 26.0
	cubeMass   = 1.0
	invMass    = 1.0 / cubeMass
	invInertia = 1.0 / ((cubeMass * cubeSize * cubeSize) / 6.0)

	startWallX        = 0.0
	startWallBounce   = 0.08
	startWallSpinDamp = 0.35

	levelHeight = 18.0
	worldLen    = 9000.0

	landingEdgePad        = cubeSize * 0.14
	landingAssistLinear   = 1.55
	landingAssistAngular  = 2.45
	landingAssistVertical = 1.15

	loopInterval  = 20 * time.Millisecond
	stateInterval = time.Second
	syncInterval  = 2 * time.Second
	cleanupAfter  = 10 * time.Minute
	revealLead    = 180 * time.Millisecond
)

type Step struct {
	X0           float64   `json:"x0"`
	X1           float64   `json:"x1"`
	Mid          float64   `json:"mid"`
	TopY         float64   `json:"top_y"`
	Slope        float64   `json:"slope"`
	NX           float64   `json:"nx"`
	NY           float64   `json:"ny"`
	LeftExposed  bool      `json:"left_exposed"`
	RightExposed bool      `json:"right_exposed"`
	Noise        []float64 `json:"noise"`
}

type Stairs struct {
	Steps   []Step
	MinTopY float64
	MaxTopY float64
}

type LaunchMove struct {
	VX    float64 `json:"vx"`
	VY    float64 `json:"vy"`
	Power int     `json:"power"`
}

type CubeState struct {
	X          float64
	Y          float64
	VX         float64
	VY         float64
	Angle      float64
	AV         float64
	Stopped    bool
	StillTimer float64
	StartX     float64
}

type PlayerState struct {
	UserID    uint
	Cube      CubeState
	Move      LaunchMove
	MoveReady bool
}

type PublicPlayerState struct {
	UserID    uint    `json:"user_id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Angle     float64 `json:"angle"`
	MoveReady bool    `json:"move_ready"`
}

type Trajectory struct {
	StartAtMS  int64       `json:"start_at_ms"`
	DurationMS int64       `json:"duration_ms"`
	Frames     [][]float64 `json:"frames"`
}

type PublicState struct {
	Type             string                     `json:"type"`
	Game             string                     `json:"game"`
	LobbyID          string                     `json:"lobby_id"`
	Revision         int64                      `json:"revision"`
	Phase            string                     `json:"phase"`
	ServerMS         int64                      `json:"server_ms"`
	Turn             int                        `json:"turn"`
	TotalTurns       int                        `json:"total_turns"`
	CountdownStartMS int64                      `json:"countdown_start_ms,omitempty"`
	StartAtMS        int64                      `json:"start_at_ms,omitempty"`
	SelectDeadlineMS int64                      `json:"select_deadline_ms,omitempty"`
	RevealEndMS      int64                      `json:"reveal_end_ms,omitempty"`
	PlayerOrder      []uint                     `json:"player_order"`
	Players          map[uint]PublicPlayerState `json:"players"`
	Terrain          []Step                     `json:"terrain,omitempty"`
	Trajectory       *Trajectory                `json:"trajectory,omitempty"`
	WinnerUserID     *uint                      `json:"winner_user_id,omitempty"`
	Message          string                     `json:"message,omitempty"`
}

type ClientMessage struct {
	Type  string  `json:"type"`
	Turn  int     `json:"turn,omitempty"`
	VX    float64 `json:"vx,omitempty"`
	VY    float64 `json:"vy,omitempty"`
	Nonce string  `json:"nonce,omitempty"`
}

type SyncMessage struct {
	Type     string `json:"type"`
	Nonce    string `json:"nonce"`
	ServerMS int64  `json:"server_ms"`
	RTTMS    int64  `json:"rtt_ms"`
}

type latencyState struct {
	RTTMS   int64
	Pending map[string]time.Time
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
		return errors.New("physics duel requires exactly 2 players")
	}
	if !contains(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	m.mu.Lock()
	s := m.sessions[lobbyID]
	if s == nil {
		seed := randomSeed()
		s = newSession(lobbyID, ids, seed, m.onMatchOver)
		m.sessions[lobbyID] = s
		go s.loop()
	}
	m.mu.Unlock()

	return s.Attach(userID, conn)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
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

func contains(ids []uint, id uint) bool {
	for _, candidate := range ids {
		if candidate == id {
			return true
		}
	}
	return false
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

	lobbyID     string
	playerOrder []uint
	clients     map[uint]*client
	players     map[uint]*PlayerState
	latency     map[uint]*latencyState
	stairs      Stairs
	seed        uint32

	phase          string
	turn           int
	countdownStart time.Time
	startAt        time.Time
	selectDeadline time.Time
	revealEnd      time.Time
	trajectory     *Trajectory
	winner         *uint
	finished       bool
	closed         bool
	lastActive     time.Time
	revision       int64
	lastBroadcast  time.Time
	lastSync       time.Time
	onMatchOver    func(lobbyID string, winnerUserID *uint)
	loopStop       chan struct{}
	loopDone       chan struct{}
}

func newSession(lobbyID string, ids []uint, seed uint32, onMatchOver func(string, *uint)) *Session {
	stairs := generateStairs(seed)
	players := make(map[uint]*PlayerState, len(ids))
	latency := make(map[uint]*latencyState, len(ids))
	for _, id := range ids {
		players[id] = &PlayerState{
			UserID: id,
			Cube:   spawnCubeOnStep(stairs, 90),
			Move:   defaultMove(),
		}
		latency[id] = &latencyState{RTTMS: 140, Pending: make(map[string]time.Time)}
	}

	return &Session{
		lobbyID:     lobbyID,
		playerOrder: append([]uint(nil), ids...),
		clients:     make(map[uint]*client),
		players:     players,
		latency:     latency,
		stairs:      stairs,
		seed:        seed,
		phase:       "waiting",
		turn:        1,
		lastActive:  time.Now(),
		onMatchOver: onMatchOver,
		loopStop:    make(chan struct{}),
		loopDone:    make(chan struct{}),
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
	s.sendStateToLocked(userID, "connected", true)
	s.sendSyncLocked(userID, time.Now())
	if s.phase == "waiting" && len(s.clients) == len(s.playerOrder) {
		s.startCountdownLocked(time.Now())
	}
	s.mu.Unlock()

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
		s.sendStateToLocked(userID, "state", true)
		s.sendSyncLocked(userID, now)
	case "move":
		s.moveLocked(userID, msg)
	case "sync_ack":
		s.acceptSyncAckLocked(userID, msg.Nonce, now)
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) startCountdownLocked(now time.Time) {
	if s.phase != "waiting" || s.finished {
		return
	}
	for _, id := range s.playerOrder {
		p := s.players[id]
		p.Cube = spawnCubeOnStep(s.stairs, 90)
		p.Move = defaultMove()
		p.MoveReady = false
	}
	s.turn = 1
	s.countdownStart = now
	s.startAt = now.Add(CountdownSeconds * time.Second)
	s.selectDeadline = s.startAt.Add(PrepSeconds * time.Second)
	s.phase = "countdown"
	s.trajectory = nil
	s.lastBroadcast = time.Time{}
	s.broadcastStateLocked("countdown", false)
}

func (s *Session) beginSelectLocked(now time.Time) {
	if s.finished {
		return
	}
	for _, id := range s.playerOrder {
		p := s.players[id]
		p.Move = defaultMove()
		p.MoveReady = false
	}
	s.phase = "select"
	s.trajectory = nil
	s.startAt = now
	s.selectDeadline = now.Add(PrepSeconds * time.Second)
	s.revealEnd = time.Time{}
	s.lastBroadcast = time.Time{}
	s.broadcastStateLocked("select", false)
}

func (s *Session) moveLocked(userID uint, msg ClientMessage) {
	if s.phase != "select" || s.finished {
		s.sendErrorLocked(userID, "move is only allowed during selection")
		return
	}
	if msg.Turn != s.turn {
		s.sendErrorLocked(userID, "stale turn")
		return
	}
	p := s.players[userID]
	if p == nil {
		s.sendErrorLocked(userID, "player is not in match")
		return
	}
	wasReady := p.MoveReady
	p.Move = clampLaunch(msg.VX, -msg.VY)
	p.MoveReady = true
	if !wasReady {
		s.broadcastStateLocked("move locked", false)
	} else {
		s.sendStateToLocked(userID, "move updated", false)
	}
}

func (s *Session) beginRevealLocked(now time.Time) {
	if s.phase != "select" || s.finished {
		return
	}

	for _, id := range s.playerOrder {
		p := s.players[id]
		if !p.MoveReady {
			p.Move = defaultMove()
		}
	}

	firstID := s.playerOrder[0]
	secondID := s.playerOrder[1]
	first := s.players[firstID]
	second := s.players[secondID]

	firstCube, secondCube, frames, duration := simulateTurn(
		s.stairs,
		first.Cube,
		second.Cube,
		first.Move,
		second.Move,
		s.seed,
		s.turn,
		firstID,
		secondID,
	)

	first.Cube = firstCube
	second.Cube = secondCube

	startAt := now.Add(revealLead)
	s.phase = "reveal"
	s.startAt = startAt
	s.revealEnd = startAt.Add(duration)
	s.trajectory = &Trajectory{
		StartAtMS:  startAt.UnixMilli(),
		DurationMS: duration.Milliseconds(),
		Frames:     frames,
	}
	s.lastBroadcast = time.Time{}
	s.broadcastStateLocked("reveal", false)
}

func (s *Session) finishLocked() {
	if s.finished {
		return
	}
	s.finished = true
	s.phase = "match_over"

	first := s.players[s.playerOrder[0]]
	second := s.players[s.playerOrder[1]]
	var winner *uint
	diff := first.Cube.X - second.Cube.X
	if math.Abs(diff) >= cubeSize*0.6 {
		if diff > 0 {
			id := first.UserID
			winner = &id
		} else {
			id := second.UserID
			winner = &id
		}
	}
	s.winner = winner
	s.broadcastStateLocked("match over", false)

	if s.onMatchOver != nil {
		lobbyID := s.lobbyID
		var copied *uint
		if winner != nil {
			id := *winner
			copied = &id
		}
		callback := s.onMatchOver
		go callback(lobbyID, copied)
	}
}

func (s *Session) updatePhaseLocked(now time.Time) {
	switch s.phase {
	case "countdown":
		if !now.Before(s.startAt) {
			s.beginSelectLocked(s.startAt)
		}
	case "select":
		if !now.Before(s.selectDeadline) {
			s.beginRevealLocked(now)
		}
	case "reveal":
		if !now.Before(s.revealEnd) {
			if s.turn >= TotalTurns {
				s.finishLocked()
			} else {
				s.turn++
				s.beginSelectLocked(now)
			}
		}
	}
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

			if (s.phase == "countdown" || s.phase == "select") &&
				(s.lastBroadcast.IsZero() || now.Sub(s.lastBroadcast) >= stateInterval) {
				s.lastBroadcast = now
				s.broadcastStateLocked("", false)
			}
			if s.lastSync.IsZero() || now.Sub(s.lastSync) >= syncInterval {
				s.lastSync = now
				for _, id := range s.playerOrder {
					s.sendSyncLocked(id, now)
				}
			}
			done := s.finished
			s.mu.Unlock()
			if done {
				return
			}
		}
	}
}

func (s *Session) publicStateLocked(message string, includeTerrain bool) PublicState {
	players := make(map[uint]PublicPlayerState, len(s.players))
	for id, p := range s.players {
		players[id] = PublicPlayerState{
			UserID:    id,
			X:         p.Cube.X,
			Y:         p.Cube.Y,
			Angle:     p.Cube.Angle,
			MoveReady: p.MoveReady,
		}
	}

	state := PublicState{
		Type:             "state",
		Game:             GameCode,
		LobbyID:          s.lobbyID,
		Revision:         s.revision,
		Phase:            s.phase,
		ServerMS:         time.Now().UnixMilli(),
		Turn:             s.turn,
		TotalTurns:       TotalTurns,
		CountdownStartMS: millis(s.countdownStart),
		StartAtMS:        millis(s.startAt),
		SelectDeadlineMS: millis(s.selectDeadline),
		RevealEndMS:      millis(s.revealEnd),
		PlayerOrder:      append([]uint(nil), s.playerOrder...),
		Players:          players,
		WinnerUserID:     cloneUintPtr(s.winner),
		Message:          message,
	}
	if includeTerrain {
		state.Terrain = append([]Step(nil), s.stairs.Steps...)
	}
	if s.phase == "reveal" && s.trajectory != nil {
		copyTrajectory := *s.trajectory
		copyTrajectory.Frames = append([][]float64(nil), s.trajectory.Frames...)
		state.Trajectory = &copyTrajectory
	}
	return state
}

func (s *Session) sendStateToLocked(userID uint, message string, includeTerrain bool) {
	s.revision++
	payload := s.publicStateLocked(message, includeTerrain)
	if cl := s.clients[userID]; cl != nil {
		go func() { _ = cl.Send(payload) }()
	}
}

func (s *Session) broadcastStateLocked(message string, includeTerrain bool) {
	s.revision++
	payload := s.publicStateLocked(message, includeTerrain)
	for _, cl := range s.clients {
		clientCopy := cl
		go func() { _ = clientCopy.Send(payload) }()
	}
}

func (s *Session) sendErrorLocked(userID uint, message string) {
	if cl := s.clients[userID]; cl != nil {
		go func() { _ = cl.Send(map[string]any{"type": "error", "error": message}) }()
	}
}

func (s *Session) sendSyncLocked(userID uint, now time.Time) {
	cl := s.clients[userID]
	state := s.latency[userID]
	if cl == nil || state == nil {
		return
	}
	nonce := randomNonce()
	state.Pending[nonce] = now
	for key, sentAt := range state.Pending {
		if now.Sub(sentAt) > 10*time.Second {
			delete(state.Pending, key)
		}
	}
	payload := SyncMessage{Type: "sync", Nonce: nonce, ServerMS: now.UnixMilli(), RTTMS: state.RTTMS}
	go func() { _ = cl.Send(payload) }()
}

func (s *Session) acceptSyncAckLocked(userID uint, nonce string, now time.Time) {
	state := s.latency[userID]
	if state == nil || nonce == "" {
		return
	}
	sentAt, ok := state.Pending[nonce]
	if !ok {
		return
	}
	delete(state.Pending, nonce)
	sample := now.Sub(sentAt).Milliseconds()
	if sample < 1 || sample > 5000 {
		return
	}
	if state.RTTMS <= 0 {
		state.RTTMS = sample
	} else {
		state.RTTMS = (state.RTTMS*3 + sample) / 4
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
	close(s.loopStop)
	for _, cl := range s.clients {
		_ = cl.conn.Close()
	}
	s.mu.Unlock()
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

func randomNonce() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf[:])
}

func randomSeed() uint32 {
	var buf [4]byte
	if _, err := rand.Read(buf[:]); err == nil {
		return uint32(buf[0])<<24 | uint32(buf[1])<<16 | uint32(buf[2])<<8 | uint32(buf[3])
	}
	return uint32(time.Now().UnixNano())
}

/* -------------------------------------------------------------------------- */
/* Deterministic staircase                                                    */
/* -------------------------------------------------------------------------- */

type mulberry struct{ a uint32 }

func newMulberry(seed uint32) *mulberry { return &mulberry{a: seed} }

func (r *mulberry) Next() float64 {
	r.a += 0x6d2b79f5
	t := r.a
	t = uint32(int32(t^(t>>15)) * int32(1|t))
	t = t + uint32(int32(t^(t>>7))*int32(61|t))
	t ^= t >> 14
	return float64(t) / 4294967296.0
}

func generateStairs(seed uint32) Stairs {
	rnd := newMulberry(seed)
	steps := make([]Step, 0, 320)
	x := 0.0
	topY := 540.0
	minTop := -3200.0
	maxTop := 620.0
	nextSafeIn := 8 + int(math.Floor(rnd.Next()*5))

	for x < worldLen {
		platform := len(steps) < 2
		safeZone := !platform && nextSafeIn <= 0

		wr := rnd.Next()
		width := 0.0
		if platform {
			width = 128 + rnd.Next()*18
		} else if safeZone {
			width = cubeSize * (1.2 + rnd.Next()*0.1)
		} else if wr < 0.66 {
			width = cubeSize * (1.0 + rnd.Next()*0.07)
		} else if wr < 0.91 {
			width = cubeSize * (1.08 + rnd.Next()*0.08)
		} else if wr < 0.99 {
			width = cubeSize * (1.18 + rnd.Next()*0.08)
		} else {
			width = cubeSize * (1.3 + rnd.Next()*0.08)
		}

		hr := rnd.Next()
		delta := 0.0
		if platform {
			delta = 0
		} else if safeZone {
			if rnd.Next() >= 0.52 {
				delta = -1
			}
		} else if hr < 0.61 {
			delta = -1
		} else if hr < 0.76 {
			delta = -2
		} else if hr < 0.985 {
			delta = 0
		} else {
			delta = 1
		}

		topY += delta * levelHeight
		if topY < minTop {
			topY = minTop + rnd.Next()*levelHeight
		}
		if topY > maxTop {
			topY = maxTop - rnd.Next()*levelHeight
		}

		slope := 0.0
		if !platform && !safeZone && rnd.Next() < 0.2 {
			slope = (rnd.Next() - 0.5) * 0.048
		}

		x0 := x
		x1 := math.Min(worldLen, x+width)
		mid := (x0 + x1) / 2
		nmag := math.Hypot(slope, 1)
		noise := make([]float64, 5)
		for i := range noise {
			noise[i] = rnd.Next()
		}

		steps = append(steps, Step{
			X0: x0, X1: x1, Mid: mid, TopY: topY, Slope: slope,
			NX: slope / nmag, NY: -1 / nmag, Noise: noise,
		})
		x = x1
		if safeZone {
			nextSafeIn = 9 + int(math.Floor(rnd.Next()*6))
		} else {
			nextSafeIn--
		}
	}

	minY := math.Inf(1)
	maxY := math.Inf(-1)
	for i := range steps {
		s := &steps[i]
		if i > 0 {
			s.LeftExposed = s.TopY < steps[i-1].TopY-1
		}
		if i+1 < len(steps) {
			s.RightExposed = s.TopY < steps[i+1].TopY-1
		}
		minY = math.Min(minY, s.TopY)
		maxY = math.Max(maxY, s.TopY)
	}
	return Stairs{Steps: steps, MinTopY: minY, MaxTopY: maxY}
}

func stepIndexAt(steps []Step, px float64) int {
	if px <= steps[0].X0 {
		return 0
	}
	if px >= steps[len(steps)-1].X1 {
		return len(steps) - 1
	}
	lo, hi := 0, len(steps)-1
	for lo <= hi {
		mid := (lo + hi) >> 1
		s := steps[mid]
		if px < s.X0 {
			hi = mid - 1
		} else if px >= s.X1 {
			lo = mid + 1
		} else {
			return mid
		}
	}
	if lo < 0 {
		return 0
	}
	if lo >= len(steps) {
		return len(steps) - 1
	}
	return lo
}

func surfaceYAt(s Step, px float64) float64 {
	cx := math.Max(s.X0, math.Min(s.X1, px))
	return s.TopY + s.Slope*(cx-s.Mid)
}

func spawnCubeOnStep(stairs Stairs, px float64) CubeState {
	s := stairs.Steps[stepIndexAt(stairs.Steps, px)]
	sy := surfaceYAt(s, px)
	return CubeState{X: px, Y: sy - cubeSize/2 - 0.5, Stopped: true, StartX: px}
}

type terrainContact struct {
	D  float64
	NX float64
	NY float64
}

func getTerrainContact(stairs Stairs, px, py float64) *terrainContact {
	steps := stairs.Steps
	s := steps[stepIndexAt(steps, px)]
	sy := surfaceYAt(s, px)
	if py <= sy {
		return nil
	}

	bestD := py - sy
	bestNX := s.NX
	bestNY := s.NY
	if s.LeftExposed {
		dl := px - s.X0
		if dl >= 0 && dl < bestD && dl < cubeSize {
			bestD, bestNX, bestNY = dl, -1, 0
		}
	}
	if s.RightExposed {
		dr := s.X1 - px
		if dr >= 0 && dr < bestD && dr < cubeSize {
			bestD, bestNX, bestNY = dr, 1, 0
		}
	}
	return &terrainContact{D: bestD, NX: bestNX, NY: bestNY}
}

/* -------------------------------------------------------------------------- */
/* Launch + authoritative simulation                                          */
/* -------------------------------------------------------------------------- */

func clampN(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func moveFromAngleSpeed(angle, speed float64) LaunchMove {
	a := clampN(angle, angleMin, angleMax)
	s := clampN(speed, minLaunch, maxLaunch)
	power := int(math.Round(clampN((s-minLaunch)/(maxLaunch-minLaunch), 0, 1) * 100))
	return LaunchMove{VX: math.Cos(a) * s, VY: -math.Sin(a) * s, Power: power}
}

func defaultMove() LaunchMove { return moveFromAngleSpeed(defaultAngle, defaultSpeed) }

func clampLaunch(vxRaw, vyUpRaw float64) LaunchMove {
	dir := 1.0
	if vxRaw < 0 {
		dir = -1
	}
	vxAbs := math.Abs(vxRaw)
	vyUp := math.Max(0, vyUpRaw)
	speed := math.Hypot(vxAbs, vyUp)
	if speed < 1 {
		return defaultMove()
	}
	angle := clampN(math.Atan2(vyUp, math.Max(1, vxAbs)), angleMin, angleMax)
	s := clampN(speed, minLaunch, maxLaunch)
	power := int(math.Round(clampN((s-minLaunch)/(maxLaunch-minLaunch), 0, 1) * 100))
	return LaunchMove{VX: dir * math.Cos(angle) * s, VY: -math.Sin(angle) * s, Power: power}
}

func launchCube(cube *CubeState, mv LaunchMove, spinDirection float64) {
	cube.VX = mv.VX
	cube.VY = mv.VY
	cube.AV = spinDirection * (minLaunchSpin + float64(mv.Power)*launchSpinPower)
	cube.Stopped = false
	cube.StillTimer = 0
	cube.StartX = cube.X
	cube.Y -= 2
}

func stepCube(stairs Stairs, cube *CubeState, h float64) {
	if cube.Stopped {
		return
	}

	cube.VY += gravity * h
	cube.VX -= cube.VX * airDrag * h
	cube.VY -= cube.VY * airDrag * h
	cube.AV -= cube.AV * angAirDrag * h

	cube.X += cube.VX * h
	cube.Y += cube.VY * h
	cube.Angle += cube.AV * h

	half := cubeSize / 2
	contact := false
	nearSurface := false
	landingAssist := 0.0

	if cube.X-half < startWallX {
		cube.X = startWallX + half
		if cube.VX < 0 {
			cube.VX = -cube.VX * startWallBounce
		}
		cube.AV *= startWallSpinDamp
		cube.StillTimer = 0
	}

	corners := [4][2]float64{{-half, -half}, {half, -half}, {half, half}, {-half, half}}
	for iter := 0; iter < solverIters; iter++ {
		ca := math.Cos(cube.Angle)
		sa := math.Sin(cube.Angle)

		for c := 0; c < 4; c++ {
			lx, ly := corners[c][0], corners[c][1]
			rx := lx*ca - ly*sa
			ry := lx*sa + ly*ca
			pxw := cube.X + rx
			pyw := cube.Y + ry

			nearStep := stairs.Steps[stepIndexAt(stairs.Steps, pxw)]
			nearSY := surfaceYAt(nearStep, pxw)
			if pyw >= nearSY-2.5 && pyw <= nearSY+8 {
				nearSurface = true
			}

			ct := getTerrainContact(stairs, pxw, pyw)
			if ct == nil {
				continue
			}
			contact = true

			topFaceContact := ct.NY < -0.62
			centered := cube.X > nearStep.X0+landingEdgePad && cube.X < nearStep.X1-landingEdgePad
			if topFaceContact && centered && cube.VY > -180 {
				landingAssist = math.Max(landingAssist, 1)
			}

			rvx := cube.VX - cube.AV*ry
			rvy := cube.VY + cube.AV*rx
			vn := rvx*ct.NX + rvy*ct.NY
			if vn < 0 {
				rn := rx*ct.NY - ry*ct.NX
				denom := invMass + rn*rn*invInertia
				j := -(1 + restitution) * vn / denom
				if j < 0 {
					j = 0
				}

				cube.VX += j * ct.NX * invMass
				cube.VY += j * ct.NY * invMass
				cube.AV += (rx*(j*ct.NY) - ry*(j*ct.NX)) * invInertia

				rvx2 := cube.VX - cube.AV*ry
				rvy2 := cube.VY + cube.AV*rx
				tx := -ct.NY
				ty := ct.NX
				vt := rvx2*tx + rvy2*ty
				rt := rx*ty - ry*tx
				denomT := invMass + rt*rt*invInertia
				jt := -vt / denomT
				maxF := friction * j
				jt = clampN(jt, -maxF, maxF)
				cube.VX += jt * tx * invMass
				cube.VY += jt * ty * invMass
				cube.AV += (rx*(jt*ty) - ry*(jt*tx)) * invInertia
			}

			correction := math.Max(ct.D-slop, 0) * corr
			if correction > 0 {
				cube.X += ct.NX * correction
				cube.Y += ct.NY * correction
			}
		}
	}

	if contact {
		cube.VX -= cube.VX * rollRes * h
		cube.AV -= cube.AV * rollRes * h
		if landingAssist > 0 {
			linearGrip := math.Min(1, landingAssistLinear*h)
			angularGrip := math.Min(1, landingAssistAngular*h)
			verticalSoft := math.Min(1, landingAssistVertical*h)
			cube.VX *= 1 - linearGrip*0.22
			cube.AV *= 1 - angularGrip*0.34
			if cube.VY > 0 {
				cube.VY *= 1 - verticalSoft*0.22
			}
		}
	}

	speed := math.Hypot(cube.VX, cube.VY)
	angSpeed := math.Abs(cube.AV)
	resting := (contact || nearSurface) && speed < speedEPS && angSpeed < angEPS
	if resting {
		cube.StillTimer += h
		if cube.StillTimer >= stillTime {
			cube.Stopped = true
			cube.VX = 0
			cube.VY = 0
			cube.AV = 0
			cube.Angle = math.Round(cube.Angle/(math.Pi/2)) * (math.Pi / 2)
		}
	} else {
		cube.StillTimer = 0
	}
}

func simulateTurn(
	stairs Stairs,
	firstStart CubeState,
	secondStart CubeState,
	firstMove LaunchMove,
	secondMove LaunchMove,
	seed uint32,
	turn int,
	firstID uint,
	secondID uint,
) (CubeState, CubeState, [][]float64, time.Duration) {
	first := firstStart
	second := secondStart

	spinRnd := newMulberry(seed ^ uint32(turn*7919) ^ uint32(firstID*131+secondID*197))
	firstDir := 1.0
	if spinRnd.Next() < 0.5 {
		firstDir = -1
	}
	secondDir := 1.0
	if spinRnd.Next() < 0.5 {
		secondDir = -1
	}
	launchCube(&first, firstMove, firstDir)
	launchCube(&second, secondMove, secondDir)

	frames := make([][]float64, 0, 360)
	frames = append(frames, []float64{0, first.X, first.Y, first.Angle, second.X, second.Y, second.Angle})

	elapsed := 0.0
	steps := 0
	maxSteps := int(math.Ceil(maxResolveSec / fixedDT))
	for steps < maxSteps {
		stepCube(stairs, &first, fixedDT)
		stepCube(stairs, &second, fixedDT)
		steps++
		elapsed += fixedDT

		if steps%2 == 0 {
			frames = append(frames, []float64{
				math.Round(elapsed * 1000),
				first.X, first.Y, first.Angle,
				second.X, second.Y, second.Angle,
			})
		}
		if first.Stopped && second.Stopped {
			break
		}
	}

	if !first.Stopped {
		first.Stopped = true
		first.VX, first.VY, first.AV = 0, 0, 0
	}
	if !second.Stopped {
		second.Stopped = true
		second.VX, second.VY, second.AV = 0, 0, 0
	}

	durationMS := int64(math.Max(1, math.Round(elapsed*1000)))
	last := frames[len(frames)-1]
	if int64(last[0]) != durationMS {
		frames = append(frames, []float64{
			float64(durationMS),
			first.X, first.Y, first.Angle,
			second.X, second.Y, second.Angle,
		})
	}
	return first, second, frames, time.Duration(durationMS) * time.Millisecond
}
