package towerstack

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
	GameCode         = "tower_stack"
	RoundSeconds     = 30
	CountdownSeconds = 3
	WorldWidth       = 360.0

	pad           = 14.0
	baseWidth     = 151.2
	minWidth      = 16.0
	baseSpeed     = 150.0
	speedStep     = 5.0
	speedMax      = 320.0
	perfectPX     = 7.0
	greatRatio    = 0.62
	minOverlapPX  = 8.0
	perfectRegrow = 5.0
	comboMin      = 4
	comboStep     = 4
	comboBonusMax = 32
	loopInterval  = 100 * time.Millisecond
	stateInterval = 1 * time.Second
	syncInterval  = 2 * time.Second
	cleanupAfter  = 10 * time.Minute
)

type Quality string

const (
	QualityPerfect Quality = "PERFECT"
	QualityGreat   Quality = "GREAT"
	QualityGood    Quality = "GOOD"
	QualityMiss    Quality = "MISS"
)

var baseScore = map[Quality]int{
	QualityPerfect: 36,
	QualityGreat:   22,
	QualityGood:    10,
	QualityMiss:    -12,
}

type Block struct {
	Left    float64 `json:"left"`
	Width   float64 `json:"width"`
	Level   int     `json:"level"`
	Perfect bool    `json:"perfect"`
}

type PlaceResult struct {
	Seq              int64   `json:"seq"`
	ClaimedServerMS  int64   `json:"claimed_server_ms"`
	AcceptedServerMS int64   `json:"accepted_server_ms"`
	TimingCorrected  bool    `json:"timing_corrected"`
	Quality          Quality `json:"quality"`
	ScoreDelta       int     `json:"score_delta"`
	Combo            int     `json:"combo"`
	ComboBonus       int     `json:"combo_bonus"`
	Placed           bool    `json:"placed"`
	Left             float64 `json:"left"`
	Width            float64 `json:"width"`
	ActiveX          float64 `json:"active_x"`
	ActiveWidth      float64 `json:"active_width"`
	Level            int     `json:"level"`
	ServerMS         int64   `json:"server_ms"`
}

type PlayerState struct {
	UserID         uint         `json:"user_id"`
	Score          int          `json:"score"`
	Combo          int          `json:"combo"`
	Blocks         []Block      `json:"blocks"`
	ActiveWidth    float64      `json:"active_width"`
	ActiveStartMS  int64        `json:"active_start_ms"`
	ActiveFromLeft bool         `json:"active_from_left"`
	ActiveSpeed    float64      `json:"active_speed"`
	LastResult     *PlaceResult `json:"last_result,omitempty"`
	LastInputMS    int64        `json:"-"`
	LastSeq        int64        `json:"last_seq"`
}

type PublicState struct {
	Type         string               `json:"type"`
	Game         string               `json:"game"`
	LobbyID      string               `json:"lobby_id"`
	Phase        string               `json:"phase"`
	Ready        bool                 `json:"ready"`
	ServerMS     int64                `json:"server_ms"`
	StartAtMS    int64                `json:"start_at_ms,omitempty"`
	DeadlineMS   int64                `json:"deadline_ms,omitempty"`
	RoundSeconds int                  `json:"round_seconds"`
	WorldWidth   float64              `json:"world_width"`
	BaseWidth    float64              `json:"base_width"`
	PlayerOrder  []uint               `json:"player_order"`
	Players      map[uint]PlayerState `json:"players"`
	WinnerUserID *uint                `json:"winner_user_id,omitempty"`
	Message      string               `json:"message,omitempty"`
}

type ClientMessage struct {
	Type              string `json:"type"`
	Seq               int64  `json:"seq,omitempty"`
	EstimatedServerMS int64  `json:"estimated_server_ms,omitempty"`
	Nonce             string `json:"nonce,omitempty"`
}

type SyncMessage struct {
	Type     string `json:"type"`
	Nonce    string `json:"nonce"`
	ServerMS int64  `json:"server_ms"`
	RTTMS    int64  `json:"rtt_ms"`
}

type latencyState struct {
	RTTMS       int64
	Pending     map[string]time.Time
	LastProbeAt time.Time
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
		return errors.New("tower stack requires exactly 2 players")
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

	lobbyID       string
	playerOrder   []uint
	clients       map[uint]*client
	ready         map[uint]bool
	players       map[uint]*PlayerState
	latency       map[uint]*latencyState
	phase         string
	startAt       time.Time
	deadline      time.Time
	winner        *uint
	finished      bool
	closed        bool
	lastActive    time.Time
	loopStop      chan struct{}
	loopDone      chan struct{}
	onMatchOver   func(lobbyID string, winnerUserID *uint)
	lastBroadcast time.Time
	lastSync      time.Time
}

func newSession(lobbyID string, ids []uint, onMatchOver func(string, *uint)) *Session {
	players := make(map[uint]*PlayerState, len(ids))
	latency := make(map[uint]*latencyState, len(ids))
	for _, id := range ids {
		players[id] = initialPlayer(id, time.Time{})
		latency[id] = &latencyState{RTTMS: 140, Pending: make(map[string]time.Time)}
	}
	return &Session{
		lobbyID:     lobbyID,
		playerOrder: append([]uint(nil), ids...),
		clients:     make(map[uint]*client),
		ready:       make(map[uint]bool),
		players:     players,
		latency:     latency,
		phase:       "waiting",
		lastActive:  time.Now(),
		loopStop:    make(chan struct{}),
		loopDone:    make(chan struct{}),
		onMatchOver: onMatchOver,
	}
}

func initialPlayer(userID uint, activeStart time.Time) *PlayerState {
	return &PlayerState{
		UserID:         userID,
		Blocks:         make([]Block, 0, 32),
		ActiveWidth:    baseWidth,
		ActiveStartMS:  millis(activeStart),
		ActiveFromLeft: true,
		ActiveSpeed:    baseSpeed,
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
	s.sendSyncLocked(userID, time.Now())
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

	conn.SetReadLimit(16 * 1024)
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

func (s *Session) startMatchLocked(now time.Time) {
	s.phase = "countdown"
	s.lastBroadcast = time.Time{}
	s.lastSync = time.Time{}
	s.startAt = now.Add(CountdownSeconds * time.Second)
	s.deadline = s.startAt.Add(RoundSeconds * time.Second)
	for _, id := range s.playerOrder {
		s.players[id] = initialPlayer(id, s.startAt)
	}
	go s.loop()
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

func (s *Session) Handle(userID uint, msg ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.lastActive = now
	s.updatePhaseLocked(now)

	switch msg.Type {
	case "state":
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
		s.sendSyncLocked(userID, now)
	case "ready":
		if s.phase == "waiting" {
			s.ready[userID] = true
			if len(s.clients) == len(s.playerOrder) && s.allReadyLocked() {
				s.startMatchLocked(now)
			} else {
				s.broadcastStateLocked("ready")
			}
		}
	case "drop":
		s.dropLocked(userID, msg, now)
	case "sync_ack":
		s.acceptSyncAckLocked(userID, msg.Nonce, now)
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) allReadyLocked() bool {
	for _, id := range s.playerOrder {
		if !s.ready[id] {
			return false
		}
	}
	return true
}

func (s *Session) updatePhaseLocked(now time.Time) {
	if s.phase == "countdown" && !now.Before(s.startAt) {
		s.phase = "playing"
	}
	if s.phase == "playing" && !now.Before(s.deadline) {
		s.finishLocked()
	}
}

func (s *Session) dropLocked(userID uint, msg ClientMessage, now time.Time) {
	if s.phase != "playing" || s.finished {
		s.sendErrorLocked(userID, "round is not playing")
		return
	}
	player := s.players[userID]
	if player == nil {
		s.sendErrorLocked(userID, "player is not in match")
		return
	}
	if msg.Seq <= player.LastSeq {
		s.sendToLocked(userID, s.publicStateForLocked(userID, "duplicate drop"))
		return
	}
	if msg.Seq != player.LastSeq+1 {
		s.sendErrorLocked(userID, "invalid drop sequence")
		return
	}

	nowMS := now.UnixMilli()
	acceptedMS := s.acceptedDropMSLocked(userID, msg.EstimatedServerMS, nowMS)
	if acceptedMS < s.startAt.UnixMilli() || acceptedMS >= s.deadline.UnixMilli() {
		s.updatePhaseLocked(now)
		s.sendErrorLocked(userID, "drop is outside round time")
		return
	}

	if player.LastInputMS != 0 && nowMS-player.LastInputMS < 70 {
		player.LastSeq = msg.Seq
		player.LastResult = &PlaceResult{
			Seq:              msg.Seq,
			ClaimedServerMS:  msg.EstimatedServerMS,
			AcceptedServerMS: acceptedMS,
			TimingCorrected:  true,
			Quality:          QualityMiss,
			ScoreDelta:       0,
			Combo:            player.Combo,
			Placed:           false,
			ActiveX:          activeX(*player, time.UnixMilli(acceptedMS)),
			ActiveWidth:      player.ActiveWidth,
			Level:            len(player.Blocks),
			ServerMS:         nowMS,
		}
		s.broadcastStateLocked("drop rate limited")
		return
	}

	player.LastInputMS = nowMS
	player.LastSeq = msg.Seq
	acceptedAt := time.UnixMilli(acceptedMS)
	x := activeX(*player, acceptedAt)
	w := player.ActiveWidth
	center := x + w/2
	placed := true
	quality := QualityGreat
	newLeft := x
	newWidth := w
	level := len(player.Blocks)

	if level == 0 {
		if math.Abs(center-WorldWidth/2) <= perfectPX {
			quality = QualityPerfect
		}
	} else {
		below := player.Blocks[level-1]
		left := math.Max(x, below.Left)
		right := math.Min(x+w, below.Left+below.Width)
		overlap := right - left
		centerDelta := math.Abs(center - (below.Left + below.Width/2))

		if overlap <= minOverlapPX {
			quality = QualityMiss
			placed = false
		} else if centerDelta <= perfectPX {
			quality = QualityPerfect
			newWidth = math.Min(baseWidth, below.Width+perfectRegrow)
			newLeft = below.Left + below.Width/2 - newWidth/2
		} else {
			if overlap/w >= greatRatio {
				quality = QualityGreat
			} else {
				quality = QualityGood
			}
			newLeft = left
			newWidth = overlap
		}
	}

	if quality == QualityPerfect || quality == QualityGreat {
		player.Combo++
	} else {
		player.Combo = 0
	}
	base := baseScore[quality]
	bonus := 0
	if (quality == QualityPerfect || quality == QualityGreat) && player.Combo >= comboMin {
		bonus = minInt(comboBonusMax, comboStep*(player.Combo-comboMin+1))
	}
	delta := base + bonus
	player.Score = maxInt(0, player.Score+delta)

	if placed {
		newWidth = math.Max(minWidth, newWidth)
		player.Blocks = append(player.Blocks, Block{
			Left:    newLeft,
			Width:   newWidth,
			Level:   level,
			Perfect: quality == QualityPerfect,
		})
		player.ActiveWidth = newWidth
		player.ActiveStartMS = acceptedMS
		player.ActiveFromLeft = len(player.Blocks)%2 == 0
		player.ActiveSpeed = math.Min(speedMax, baseSpeed+float64(len(player.Blocks))*speedStep)
	}

	player.LastResult = &PlaceResult{
		Seq:              msg.Seq,
		ClaimedServerMS:  msg.EstimatedServerMS,
		AcceptedServerMS: acceptedMS,
		TimingCorrected:  msg.EstimatedServerMS != 0 && msg.EstimatedServerMS != acceptedMS,
		Quality:          quality,
		ScoreDelta:       delta,
		Combo:            player.Combo,
		ComboBonus:       bonus,
		Placed:           placed,
		Left:             newLeft,
		Width:            newWidth,
		ActiveX:          x,
		ActiveWidth:      w,
		Level:            level,
		ServerMS:         nowMS,
	}

	s.broadcastStateLocked("drop")
}

func (s *Session) acceptedDropMSLocked(userID uint, claimedMS, nowMS int64) int64 {
	rtt := int64(140)
	if state := s.latency[userID]; state != nil && state.RTTMS > 0 {
		rtt = state.RTTMS
	}
	allowedRewind := clampInt64(rtt/2+70, 80, 260)
	minMS := nowMS - allowedRewind
	maxMS := nowMS + 25
	if claimedMS <= 0 {
		claimedMS = nowMS - rtt/2
	}
	return clampInt64(claimedMS, minMS, maxMS)
}

func (s *Session) sendSyncLocked(userID uint, now time.Time) {
	cl := s.clients[userID]
	state := s.latency[userID]
	if cl == nil || state == nil {
		return
	}
	nonce := randomNonce()
	state.Pending[nonce] = now
	state.LastProbeAt = now
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

func randomNonce() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf[:])
}

func activeX(player PlayerState, now time.Time) float64 {
	w := player.ActiveWidth
	minX := pad
	maxX := WorldWidth - w - pad
	if maxX <= minX {
		return minX
	}
	start := time.UnixMilli(player.ActiveStartMS)
	elapsed := math.Max(0, now.Sub(start).Seconds())
	distance := elapsed * player.ActiveSpeed
	travel := maxX - minX
	period := travel * 2
	position := math.Mod(distance, period)
	var x float64
	if position <= travel {
		x = minX + position
	} else {
		x = maxX - (position - travel)
	}
	if !player.ActiveFromLeft {
		x = minX + maxX - x
	}
	return x
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
	if first.Score > second.Score {
		id := first.UserID
		winner = &id
	} else if second.Score > first.Score {
		id := second.UserID
		winner = &id
	}
	s.winner = winner
	s.broadcastStateLocked("match over")

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

func (s *Session) publicStateForLocked(userID uint, message string) PublicState {
	players := make(map[uint]PlayerState, len(s.players))
	for id, state := range s.players {
		copyState := *state
		if id == userID {
			copyState.Blocks = append([]Block(nil), state.Blocks...)
		} else {
			// Rival tower geometry is private. The opponent only receives the
			// score, combo and last quality shown in the existing HUD.
			copyState.Blocks = nil
			copyState.ActiveWidth = 0
			copyState.ActiveStartMS = 0
			copyState.ActiveFromLeft = false
			copyState.ActiveSpeed = 0
			copyState.LastSeq = 0
		}
		if state.LastResult != nil {
			result := *state.LastResult
			if id != userID {
				result.Left = 0
				result.Width = 0
				result.ActiveX = 0
				result.ActiveWidth = 0
				result.Level = 0
			}
			copyState.LastResult = &result
		}
		players[id] = copyState
	}
	return PublicState{
		Type:         "state",
		Game:         GameCode,
		LobbyID:      s.lobbyID,
		Phase:        s.phase,
		Ready:        s.allReadyLocked(),
		ServerMS:     time.Now().UnixMilli(),
		StartAtMS:    millis(s.startAt),
		DeadlineMS:   millis(s.deadline),
		RoundSeconds: RoundSeconds,
		WorldWidth:   WorldWidth,
		BaseWidth:    baseWidth,
		PlayerOrder:  append([]uint(nil), s.playerOrder...),
		Players:      players,
		WinnerUserID: cloneUintPtr(s.winner),
		Message:      message,
	}
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

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func clampInt64(value, minValue, maxValue int64) int64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}