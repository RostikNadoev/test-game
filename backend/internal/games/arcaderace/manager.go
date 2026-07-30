package arcaderace

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	FlappyRaceGameCode = "flappy_race"
	DoodleJumpGameCode = "doodle_jump"
	CrossyPVPGameCode  = "crossy_pvp"
	CoinChaseGameCode  = "coin_chase"
	CubeFillGameCode   = "cube_fill"
	DrawDropGameCode   = "draw_drop"
	BallzDuelGameCode  = "ballz_duel"

	PhaseWaiting   = "waiting"
	PhaseCountdown = "countdown"
	PhasePlaying   = "playing"
	PhaseMatchOver = "match_over"

	CountdownDuration      = 3 * time.Second
	MatchDuration          = 45 * time.Second
	CoinChaseMatchDuration = 60 * time.Second
	CubeFillMatchDuration  = 60 * time.Second
	DrawDropMatchDuration  = 100 * time.Second
	BallzDuelMatchDuration = 90 * time.Second
	SessionTTL             = 30 * time.Minute
)

type ClientMessage struct {
	Type     string  `json:"type"`
	EventID  uint64  `json:"event_id,omitempty"`
	Kind     string  `json:"kind,omitempty"`
	Grade    string  `json:"grade,omitempty"`
	ObjectID int64   `json:"object_id,omitempty"`
	Value    int     `json:"value,omitempty"`
	Perfect  bool    `json:"perfect,omitempty"`
	Angle    float64 `json:"angle,omitempty"`
	Balls    int     `json:"balls,omitempty"`
}

type PublicState struct {
	Type                string             `json:"type"`
	Game                string             `json:"game"`
	LobbyID             string             `json:"lobby_id"`
	Phase               string             `json:"phase"`
	Ready               bool               `json:"ready"`
	ServerMS            int64              `json:"server_ms"`
	Seed                int64              `json:"seed"`
	PlayerOrder         []uint             `json:"player_order"`
	Scores              map[uint]int       `json:"scores"`
	Combos              map[uint]int       `json:"combos"`
	BestCombos          map[uint]int       `json:"best_combos"`
	HeightScores        map[uint]int       `json:"height_scores"`
	CubeLevelIndices    []int              `json:"cube_level_indices,omitempty"`
	CubeLevels          map[uint]int       `json:"cube_levels,omitempty"`
	CubeLevelProgress   map[uint]int       `json:"cube_level_progress,omitempty"`
	CubeProgressBP      map[uint]int       `json:"cube_progress_bp,omitempty"`
	CubeMoves           map[uint]int       `json:"cube_moves,omitempty"`
	CubeEfficiency      map[uint]int       `json:"cube_efficiency,omitempty"`
	CubeFinished        map[uint]bool      `json:"cube_finished,omitempty"`
	DrawLevelIndices    []int              `json:"draw_level_indices,omitempty"`
	DrawCompleted       map[uint][]bool    `json:"draw_completed,omitempty"`
	DrawInk             map[uint][]int     `json:"draw_ink,omitempty"`
	DrawCompletedCount  map[uint]int       `json:"draw_completed_count,omitempty"`
	DrawTotalInk        map[uint]int       `json:"draw_total_ink,omitempty"`
	DrawInkRatioBP      map[uint]int       `json:"draw_ink_ratio_bp,omitempty"`
	DrawEfficiencyBP    map[uint]int       `json:"draw_efficiency_bp,omitempty"`
	DrawFinished        map[uint]bool      `json:"draw_finished,omitempty"`
	BallzStages         []BallzStageLayout `json:"ballz_stages,omitempty"`
	BallzStage          map[uint]int       `json:"ballz_stage,omitempty"`
	BallzBrickHP        map[uint][]int     `json:"ballz_brick_hp,omitempty"`
	BallzPickupAlive    map[uint][]bool    `json:"ballz_pickup_alive,omitempty"`
	BallzAvailableBalls map[uint]int       `json:"ballz_available_balls,omitempty"`
	BallzBallsUsed      map[uint]int       `json:"ballz_balls_used,omitempty"`
	BallzShots          map[uint]int       `json:"ballz_shots,omitempty"`
	BallzProgressBP     map[uint]int       `json:"ballz_progress_bp,omitempty"`
	BallzEfficiencyBP   map[uint]int       `json:"ballz_efficiency_bp,omitempty"`
	BallzFinished       map[uint]bool      `json:"ballz_finished,omitempty"`
	BallzLaunchXBP      map[uint]int       `json:"ballz_launch_x_bp,omitempty"`
	LastEventIDs        map[uint]uint64    `json:"last_event_ids,omitempty"`
	BetCoins            float64            `json:"bet_coins"`
	WinnerProfit        float64            `json:"winner_profit"`
	CountdownEndsMS     int64              `json:"countdown_ends_ms,omitempty"`
	MatchEndsMS         int64              `json:"match_ends_ms,omitempty"`
	WinnerUserID        uint               `json:"winner_user_id,omitempty"`
	Draw                bool               `json:"draw,omitempty"`
	LastEventUserID     uint               `json:"last_event_user_id,omitempty"`
	LastEventKind       string             `json:"last_event_kind,omitempty"`
	LastEventGrade      string             `json:"last_event_grade,omitempty"`
	LastEventPoints     int                `json:"last_event_points,omitempty"`
	LastEventID         uint64             `json:"last_event_id,omitempty"`
	Message             string             `json:"message,omitempty"`
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
	gameCode string,
	lobbyID string,
	playerIDs []uint,
	userID uint,
	betCoins float64,
	conn *websocket.Conn,
) error {
	gameCode = normalizeGameCode(gameCode)
	if !IsSupportedGame(gameCode) {
		return errors.New("unsupported arcade race game")
	}
	if strings.TrimSpace(lobbyID) == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("arcade race requires exactly 2 players")
	}
	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	key := gameCode + ":" + lobbyID

	m.mu.Lock()
	session := m.sessions[key]
	if session == nil {
		session = NewSession(gameCode, lobbyID, ids, betCoins, m.onMatchOver)
		m.sessions[key] = session
	}
	m.mu.Unlock()

	return session.Attach(userID, conn)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for now := range ticker.C {
		m.mu.Lock()
		for key, session := range m.sessions {
			if session.CanCleanup(now) {
				delete(m.sessions, key)
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

	gameCode    string
	lobbyID     string
	playerOrder []uint
	clients     map[uint]*Client
	betCoins    float64

	scores               map[uint]int
	combos               map[uint]int
	bestCombos           map[uint]int
	heightScores         map[uint]int
	heightSteps          map[uint]int
	lastEventID          map[uint]uint64
	lastEventAt          map[uint]map[string]time.Time
	seenObjects          map[uint]map[string]bool
	lastGateID           map[uint]int64
	cubeLevelIndices     []int
	cubeStates           map[uint]*CubeFillPlayerState
	drawDropLevelIndices []int
	drawDropStates       map[uint]*DrawDropPlayerState
	ballzStages          []BallzStageLayout
	ballzStates          map[uint]*BallzPlayerState

	phase           string
	seed            int64
	countdownEndsAt time.Time
	matchStartsAt   time.Time
	matchEndsAt     time.Time
	winnerUserID    uint
	draw            bool
	lastEventUserID uint
	lastEventKind   string
	lastEventGrade  string
	lastEventPoints int
	lastActivity    time.Time
	settled         bool
	closed          bool
	paused          bool
	pauseCountdown  time.Duration
	pauseMatch      time.Duration

	countdownTimer   *time.Timer
	matchTimer       *time.Timer
	ballzFinishTimer *time.Timer
	onMatchOver      func(lobbyID string, winnerUserID *uint)
}

func NewSession(
	gameCode string,
	lobbyID string,
	playerIDs []uint,
	betCoins float64,
	onMatchOver func(lobbyID string, winnerUserID *uint),
) *Session {
	s := &Session{
		gameCode:       normalizeGameCode(gameCode),
		lobbyID:        lobbyID,
		playerOrder:    append([]uint(nil), playerIDs...),
		clients:        make(map[uint]*Client),
		betCoins:       maxFloat64(0, betCoins),
		scores:         make(map[uint]int),
		combos:         make(map[uint]int),
		bestCombos:     make(map[uint]int),
		heightScores:   make(map[uint]int),
		heightSteps:    make(map[uint]int),
		lastEventID:    make(map[uint]uint64),
		lastEventAt:    make(map[uint]map[string]time.Time),
		seenObjects:    make(map[uint]map[string]bool),
		lastGateID:     make(map[uint]int64),
		cubeStates:     make(map[uint]*CubeFillPlayerState),
		drawDropStates: make(map[uint]*DrawDropPlayerState),
		ballzStates:    make(map[uint]*BallzPlayerState),
		phase:          PhaseWaiting,
		seed:           randomSeed(),
		lastActivity:   time.Now(),
		onMatchOver:    onMatchOver,
	}

	for _, id := range playerIDs {
		s.lastEventAt[id] = make(map[string]time.Time)
		s.seenObjects[id] = make(map[string]bool)
	}
	s.resetScoresLocked()
	return s
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

	switch strings.TrimSpace(strings.ToLower(message.Type)) {
	case "state":
		s.sendToLocked(userID, s.publicStateLocked())
	case "event":
		s.applyEventLocked(userID, message)
	case "ping":
		s.sendToLocked(userID, map[string]any{
			"type":      "pong",
			"server_ms": time.Now().UTC().UnixMilli(),
		})
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) applyEventLocked(userID uint, message ClientMessage) {
	now := time.Now()
	if s.paused || s.phase != PhasePlaying || now.After(s.matchEndsAt) {
		return
	}
	if message.EventID == 0 || message.EventID <= s.lastEventID[userID] {
		return
	}

	kind := strings.TrimSpace(strings.ToLower(message.Kind))
	grade := strings.TrimSpace(strings.ToLower(message.Grade))
	if kind == "" {
		s.sendErrorLocked(userID, "event kind is required")
		return
	}

	if !s.eventIntervalAllowedLocked(userID, kind, now) {
		s.sendErrorLocked(userID, "event is too fast")
		return
	}

	points, accepted, err := s.calculateEventLocked(userID, message, kind, grade, now)
	if err != nil {
		s.sendErrorLocked(userID, err.Error())
		return
	}
	if !accepted {
		return
	}

	s.lastEventID[userID] = message.EventID
	s.lastEventAt[userID][kind] = now
	s.lastEventUserID = userID
	s.lastEventKind = kind
	s.lastEventGrade = grade
	s.lastEventPoints = points

	if s.gameCode == CubeFillGameCode && s.cubeFillAllFinishedLocked() {
		s.finishLocked()
		return
	}
	if s.gameCode == DrawDropGameCode && s.drawDropAllFinishedLocked() {
		s.finishLocked()
		return
	}
	if s.gameCode == BallzDuelGameCode && s.ballzAllFinishedLocked() {
		s.broadcastLocked(s.publicStateLocked())
		delay := s.ballzFinishDelayLocked(now)
		if delay <= 0 {
			s.finishLocked()
			return
		}
		if s.ballzFinishTimer != nil {
			s.ballzFinishTimer.Stop()
		}
		s.ballzFinishTimer = time.AfterFunc(delay, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.closed || s.settled || s.phase != PhasePlaying {
				return
			}
			s.finishLocked()
		})
		return
	}

	s.broadcastLocked(s.publicStateLocked())
}

func (s *Session) calculateEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
	grade string,
	now time.Time,
) (int, bool, error) {
	switch s.gameCode {
	case FlappyRaceGameCode:
		return s.applyFlappyEventLocked(userID, message, kind, grade)
	case DoodleJumpGameCode:
		return s.applyDoodleEventLocked(userID, message, kind, grade, now)
	case CrossyPVPGameCode:
		return s.applyCrossyEventLocked(userID, message, kind, grade, now)
	case CoinChaseGameCode:
		return s.applyCoinChaseEventLocked(userID, message, kind, now)
	case CubeFillGameCode:
		return s.applyCubeFillEventLocked(userID, message, kind)
	case DrawDropGameCode:
		return s.applyDrawDropEventLocked(userID, message, kind)
	case BallzDuelGameCode:
		return s.applyBallzEventLocked(userID, message, kind, now)
	default:
		return 0, false, errors.New("unsupported game")
	}
}

func (s *Session) applyFlappyEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
	grade string,
) (int, bool, error) {
	switch kind {
	case "gate":
		if message.ObjectID <= 0 {
			return 0, false, errors.New("gate object_id is required")
		}
		lastGate := s.lastGateID[userID]
		if lastGate > 0 && (message.ObjectID <= lastGate || message.ObjectID-lastGate > 4) {
			return 0, false, errors.New("invalid gate sequence")
		}
		if !s.markObjectLocked(userID, "gate", message.ObjectID) {
			return 0, false, nil
		}
		s.lastGateID[userID] = message.ObjectID
		s.combos[userID]++
		s.updateBestComboLocked(userID)
		base := 12
		if message.Perfect || grade == "perfect" {
			base = 22
			grade = "perfect"
		} else {
			grade = "gate"
		}
		points := base * comboMultiplier(s.combos[userID])
		s.scores[userID] += points
		return points, true, nil

	case "star":
		if message.ObjectID <= 0 {
			return 0, false, errors.New("star object_id is required")
		}
		if !s.markObjectLocked(userID, "star", message.ObjectID) {
			return 0, false, nil
		}
		points := 8 * comboMultiplier(s.combos[userID])
		s.scores[userID] += points
		return points, true, nil

	case "crash":
		s.combos[userID] = 0
		points := -18
		s.scores[userID] = maxInt(0, s.scores[userID]+points)
		return points, true, nil
	default:
		return 0, false, errors.New("invalid flappy event")
	}
}

func (s *Session) applyDoodleEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
	grade string,
	now time.Time,
) (int, bool, error) {
	switch kind {
	case "platform":
		if message.ObjectID <= 0 {
			return 0, false, errors.New("platform object_id is required")
		}
		switch grade {
		case "normal", "moving", "spring", "breakable":
		default:
			return 0, false, errors.New("invalid platform grade")
		}
		if !s.markObjectLocked(userID, "platform", message.ObjectID) {
			return 0, false, nil
		}
		if message.Perfect {
			s.combos[userID]++
		} else {
			s.combos[userID] = maxInt(0, s.combos[userID]-1)
		}
		s.updateBestComboLocked(userID)

		base := 6
		if message.Perfect {
			base = 14
		}
		bonus := 0
		switch grade {
		case "moving":
			bonus = 8
		case "spring":
			bonus = 25
		case "breakable":
			bonus = 12
		}
		points := base*comboMultiplier(s.combos[userID]) + bonus
		s.scores[userID] += points
		return points, true, nil

	case "star":
		if message.ObjectID <= 0 {
			return 0, false, errors.New("star object_id is required")
		}
		if !s.markObjectLocked(userID, "star", message.ObjectID) {
			return 0, false, nil
		}
		const points = 18
		s.scores[userID] += points
		return points, true, nil

	case "height":
		if message.Value <= s.heightSteps[userID] {
			return 0, false, nil
		}
		elapsed := now.Sub(s.matchStartsAt)
		if elapsed < 0 {
			elapsed = 0
		}
		maxAllowedSteps := 18 + int(elapsed.Seconds()*10.5)
		if message.Value > maxAllowedSteps {
			return 0, false, errors.New("height progress is too fast")
		}
		difference := message.Value - s.heightSteps[userID]
		if difference > 14 {
			return 0, false, errors.New("height jump is too large")
		}
		s.heightSteps[userID] = message.Value
		points := difference * 2
		s.heightScores[userID] += points
		s.scores[userID] += points
		return points, true, nil

	case "fall":
		s.combos[userID] = 0
		points := -28
		s.scores[userID] = maxInt(0, s.scores[userID]+points)
		return points, true, nil
	default:
		return 0, false, errors.New("invalid doodle event")
	}
}

func (s *Session) applyCrossyEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
	grade string,
	now time.Time,
) (int, bool, error) {
	switch kind {
	case "row":
		if message.Value <= s.heightSteps[userID] {
			return 0, false, nil
		}

		elapsed := now.Sub(s.matchStartsAt)
		if elapsed < 0 {
			elapsed = 0
		}

		// Один прыжок занимает 116 мс. Небольшой запас оставлен под задержку и кадры.
		maxAllowedRow := 4 + int(elapsed.Seconds()*9.4)
		if message.Value > maxAllowedRow {
			return 0, false, errors.New("row progress is too fast")
		}

		difference := message.Value - s.heightSteps[userID]
		if difference > 4 {
			return 0, false, errors.New("row jump is too large")
		}

		s.heightSteps[userID] = message.Value
		s.heightScores[userID] = message.Value
		points := difference * 8
		s.scores[userID] += points
		return points, true, nil

	case "coin":
		if message.ObjectID <= 0 {
			return 0, false, errors.New("coin object_id is required")
		}
		if message.Value < 0 || message.Value > s.heightSteps[userID]+1 {
			return 0, false, errors.New("coin row is invalid")
		}
		if !s.markObjectLocked(userID, "coin", message.ObjectID) {
			return 0, false, nil
		}

		s.combos[userID]++ // Для Crossy поле combos хранит число монет.
		s.updateBestComboLocked(userID)
		const points = 22
		s.scores[userID] += points
		return points, true, nil

	case "death":
		switch grade {
		case "crash", "train", "splash":
		default:
			return 0, false, errors.New("invalid crossy death grade")
		}

		previous := s.scores[userID]
		s.scores[userID] = maxInt(0, previous-24)
		return s.scores[userID] - previous, true, nil

	default:
		return 0, false, errors.New("invalid crossy event")
	}
}

func (s *Session) applyCoinChaseEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
	now time.Time,
) (int, bool, error) {
	switch kind {
	case "coin":
		if message.ObjectID <= 0 {
			return 0, false, errors.New("coin object_id is required")
		}
		if !s.markObjectLocked(userID, "coin", message.ObjectID) {
			return 0, false, nil
		}

		elapsed := now.Sub(s.matchStartsAt)
		if elapsed < 0 {
			elapsed = 0
		}

		// PLAYER_SPEED on the client is about 5.45 cells/sec.
		// This leaves network/frame headroom but prevents event flooding.
		maxAllowedCoins := 5 + int(elapsed.Seconds()*6.4)
		if s.combos[userID]+1 > maxAllowedCoins {
			return 0, false, errors.New("coin progress is too fast")
		}

		s.combos[userID]++
		s.updateBestComboLocked(userID)
		s.scores[userID]++
		return 1, true, nil

	case "caught":
		previous := s.scores[userID]
		s.scores[userID] = maxInt(0, previous-6)
		return s.scores[userID] - previous, true, nil

	default:
		return 0, false, errors.New("invalid coin chase event")
	}
}

func (s *Session) eventIntervalAllowedLocked(userID uint, kind string, now time.Time) bool {
	minimum := 80 * time.Millisecond
	switch kind {
	case "gate", "platform":
		minimum = 170 * time.Millisecond
	case "crash", "fall", "death", "caught":
		minimum = 650 * time.Millisecond
	case "height", "row":
		minimum = 70 * time.Millisecond
	case "star":
		minimum = 40 * time.Millisecond
	case "coin":
		minimum = 110 * time.Millisecond
	case "swipe":
		minimum = 95 * time.Millisecond
	case "complete":
		minimum = 450 * time.Millisecond
	case "shot":
		minimum = 300 * time.Millisecond
	}
	previous := s.lastEventAt[userID][kind]
	return previous.IsZero() || now.Sub(previous) >= minimum
}

func (s *Session) markObjectLocked(userID uint, kind string, objectID int64) bool {
	key := fmt.Sprintf("%s:%d", kind, objectID)
	if s.seenObjects[userID][key] {
		return false
	}
	s.seenObjects[userID][key] = true
	return true
}

func (s *Session) updateBestComboLocked(userID uint) {
	if s.combos[userID] > s.bestCombos[userID] {
		s.bestCombos[userID] = s.combos[userID]
	}
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
	if s.ballzFinishTimer != nil {
		s.ballzFinishTimer.Stop()
		s.ballzFinishTimer = nil
	}

	s.seed = randomSeed()
	s.phase = PhaseCountdown
	s.countdownEndsAt = time.Now().Add(CountdownDuration)
	s.matchStartsAt = time.Time{}
	s.matchEndsAt = time.Time{}
	s.winnerUserID = 0
	s.draw = false
	s.lastEventUserID = 0
	s.lastEventKind = ""
	s.lastEventGrade = ""
	s.lastEventPoints = 0
	s.resetScoresLocked()
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
	now := time.Now()
	s.phase = PhasePlaying
	s.countdownEndsAt = time.Time{}
	s.matchStartsAt = now
	duration := matchDurationForGame(s.gameCode)
	s.matchEndsAt = now.Add(duration)
	s.broadcastLocked(s.publicStateLocked())

	s.matchTimer = time.AfterFunc(duration, func() {
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
	if s.ballzFinishTimer != nil {
		s.ballzFinishTimer.Stop()
		s.ballzFinishTimer = nil
	}

	first := s.playerOrder[0]
	second := s.playerOrder[1]

	if s.gameCode == BallzDuelGameCode {
		winner, draw := s.ballzWinnerLocked()
		s.winnerUserID = winner
		s.draw = draw
	} else if s.gameCode == DrawDropGameCode {
		winner, draw := s.drawDropWinnerLocked()
		s.winnerUserID = winner
		s.draw = draw
	} else {
		s.draw = s.scores[first] == s.scores[second]
		if !s.draw {
			if s.scores[first] > s.scores[second] {
				s.winnerUserID = first
			} else {
				s.winnerUserID = second
			}
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

func (s *Session) resetScoresLocked() {
	for _, id := range s.playerOrder {
		s.scores[id] = 0
		s.combos[id] = 0
		s.bestCombos[id] = 0
		s.heightScores[id] = 0
		s.heightSteps[id] = 0
		s.lastEventID[id] = 0
		s.lastGateID[id] = 0
		s.lastEventAt[id] = make(map[string]time.Time)
		s.seenObjects[id] = make(map[string]bool)
	}

	if s.gameCode == CubeFillGameCode {
		s.resetCubeFillLocked()
	} else {
		s.cubeLevelIndices = nil
		s.cubeStates = make(map[uint]*CubeFillPlayerState)
	}

	if s.gameCode == DrawDropGameCode {
		s.resetDrawDropLocked()
	} else {
		s.drawDropLevelIndices = nil
		s.drawDropStates = make(map[uint]*DrawDropPlayerState)
	}

	if s.gameCode == BallzDuelGameCode {
		s.resetBallzLocked()
	} else {
		s.ballzStages = nil
		s.ballzStates = make(map[uint]*BallzPlayerState)
	}
}

func (s *Session) publicStateLocked() PublicState {
	scores := make(map[uint]int, len(s.scores))
	combos := make(map[uint]int, len(s.combos))
	bestCombos := make(map[uint]int, len(s.bestCombos))
	heightScores := make(map[uint]int, len(s.heightScores))
	for _, id := range s.playerOrder {
		scores[id] = s.scores[id]
		combos[id] = s.combos[id]
		bestCombos[id] = s.bestCombos[id]
		heightScores[id] = s.heightScores[id]
	}

	var cubeLevelIndices []int
	var cubeLevels map[uint]int
	var cubeLevelProgress map[uint]int
	var cubeProgressBP map[uint]int
	var cubeMoves map[uint]int
	var cubeEfficiency map[uint]int
	var cubeFinished map[uint]bool

	var drawLevelIndices []int
	var drawCompleted map[uint][]bool
	var drawInk map[uint][]int
	var drawCompletedCount map[uint]int
	var drawTotalInk map[uint]int
	var drawInkRatioBP map[uint]int
	var drawEfficiencyBP map[uint]int
	var drawFinished map[uint]bool

	var ballzStages []BallzStageLayout
	var ballzStage map[uint]int
	var ballzBrickHP map[uint][]int
	var ballzPickupAlive map[uint][]bool
	var ballzAvailableBalls map[uint]int
	var ballzBallsUsed map[uint]int
	var ballzShots map[uint]int
	var ballzProgressBP map[uint]int
	var ballzEfficiencyBP map[uint]int
	var ballzFinished map[uint]bool
	var ballzLaunchXBP map[uint]int

	if s.gameCode == CubeFillGameCode {
		cubeLevelIndices = append([]int(nil), s.cubeLevelIndices...)
		cubeLevels = make(map[uint]int, len(s.playerOrder))
		cubeLevelProgress = make(map[uint]int, len(s.playerOrder))
		cubeProgressBP = make(map[uint]int, len(s.playerOrder))
		cubeMoves = make(map[uint]int, len(s.playerOrder))
		cubeEfficiency = make(map[uint]int, len(s.playerOrder))
		cubeFinished = make(map[uint]bool, len(s.playerOrder))

		for _, id := range s.playerOrder {
			player := s.cubeStates[id]
			if player == nil {
				continue
			}
			cubeLevels[id] = player.displayLevel()
			cubeLevelProgress[id] = s.cubeFillCurrentLevelProgressLocked(player)
			cubeProgressBP[id] = s.cubeFillProgressBPLocked(player)
			cubeMoves[id] = player.TotalMoves
			cubeEfficiency[id] = s.cubeFillEfficiencyLocked(player)
			cubeFinished[id] = player.Finished
		}
	}

	if s.gameCode == DrawDropGameCode {
		drawLevelIndices = append([]int(nil), s.drawDropLevelIndices...)
		drawCompleted = make(map[uint][]bool, len(s.playerOrder))
		drawInk = make(map[uint][]int, len(s.playerOrder))
		drawCompletedCount = make(map[uint]int, len(s.playerOrder))
		drawTotalInk = make(map[uint]int, len(s.playerOrder))
		drawInkRatioBP = make(map[uint]int, len(s.playerOrder))
		drawEfficiencyBP = make(map[uint]int, len(s.playerOrder))
		drawFinished = make(map[uint]bool, len(s.playerOrder))

		for _, id := range s.playerOrder {
			player := s.drawDropStates[id]
			if player == nil {
				continue
			}
			completed := make([]bool, drawDropRoundLevelCount)
			ink := make([]int, drawDropRoundLevelCount)
			for slot := 0; slot < drawDropRoundLevelCount; slot++ {
				completed[slot] = player.Completed[slot]
				ink[slot] = player.InkUsed[slot]
			}
			drawCompleted[id] = completed
			drawInk[id] = ink
			drawCompletedCount[id] = player.completedCount()
			drawTotalInk[id] = player.totalInk()
			drawInkRatioBP[id] = s.drawDropInkRatioBPLocked(player)
			drawEfficiencyBP[id] = s.drawDropEfficiencyBPLocked(player)
			drawFinished[id] = player.Finished
		}
	}

	if s.gameCode == BallzDuelGameCode {
		ballzStages = append([]BallzStageLayout(nil), s.ballzStages...)
		ballzStage = make(map[uint]int, len(s.playerOrder))
		ballzBrickHP = make(map[uint][]int, len(s.playerOrder))
		ballzPickupAlive = make(map[uint][]bool, len(s.playerOrder))
		ballzAvailableBalls = make(map[uint]int, len(s.playerOrder))
		ballzBallsUsed = make(map[uint]int, len(s.playerOrder))
		ballzShots = make(map[uint]int, len(s.playerOrder))
		ballzProgressBP = make(map[uint]int, len(s.playerOrder))
		ballzEfficiencyBP = make(map[uint]int, len(s.playerOrder))
		ballzFinished = make(map[uint]bool, len(s.playerOrder))
		ballzLaunchXBP = make(map[uint]int, len(s.playerOrder))

		for _, id := range s.playerOrder {
			player := s.ballzStates[id]
			if player == nil {
				continue
			}

			ballzStage[id] = player.displayStage()
			ballzAvailableBalls[id] = player.AvailableBalls
			ballzBallsUsed[id] = player.BallsUsed
			ballzShots[id] = player.Shots
			ballzProgressBP[id] = s.ballzProgressBPLocked(player)
			ballzEfficiencyBP[id] = s.ballzEfficiencyBPLocked(player)
			ballzFinished[id] = player.Finished
			ballzLaunchXBP[id] = ballzClampInt(int(player.LaunchX*10_000+0.5), 0, 10_000)

			stageIndex := player.Stage
			if player.Finished {
				stageIndex = ballzStageCount - 1
			}
			if stageIndex >= 0 && stageIndex < len(player.BrickHP) {
				ballzBrickHP[id] = append([]int(nil), player.BrickHP[stageIndex]...)
				ballzPickupAlive[id] = append([]bool(nil), player.PickupAlive[stageIndex]...)
			}
		}
	}

	lastEventIDs := make(map[uint]uint64, len(s.playerOrder))
	for _, id := range s.playerOrder {
		lastEventIDs[id] = s.lastEventID[id]
	}

	state := PublicState{
		Type:                "state",
		Game:                s.gameCode,
		LobbyID:             s.lobbyID,
		Phase:               s.phase,
		Ready:               len(s.clients) == 2,
		ServerMS:            time.Now().UTC().UnixMilli(),
		Seed:                s.seed,
		PlayerOrder:         append([]uint(nil), s.playerOrder...),
		Scores:              scores,
		Combos:              combos,
		BestCombos:          bestCombos,
		HeightScores:        heightScores,
		CubeLevelIndices:    cubeLevelIndices,
		CubeLevels:          cubeLevels,
		CubeLevelProgress:   cubeLevelProgress,
		CubeProgressBP:      cubeProgressBP,
		CubeMoves:           cubeMoves,
		CubeEfficiency:      cubeEfficiency,
		CubeFinished:        cubeFinished,
		DrawLevelIndices:    drawLevelIndices,
		DrawCompleted:       drawCompleted,
		DrawInk:             drawInk,
		DrawCompletedCount:  drawCompletedCount,
		DrawTotalInk:        drawTotalInk,
		DrawInkRatioBP:      drawInkRatioBP,
		DrawEfficiencyBP:    drawEfficiencyBP,
		DrawFinished:        drawFinished,
		BallzStages:         ballzStages,
		BallzStage:          ballzStage,
		BallzBrickHP:        ballzBrickHP,
		BallzPickupAlive:    ballzPickupAlive,
		BallzAvailableBalls: ballzAvailableBalls,
		BallzBallsUsed:      ballzBallsUsed,
		BallzShots:          ballzShots,
		BallzProgressBP:     ballzProgressBP,
		BallzEfficiencyBP:   ballzEfficiencyBP,
		BallzFinished:       ballzFinished,
		BallzLaunchXBP:      ballzLaunchXBP,
		LastEventIDs:        lastEventIDs,
		BetCoins:            s.betCoins,
		WinnerProfit:        s.winnerProfitLocked(),
		WinnerUserID:        s.winnerUserID,
		Draw:                s.draw,
		LastEventUserID:     s.lastEventUserID,
		LastEventKind:       s.lastEventKind,
		LastEventGrade:      s.lastEventGrade,
		LastEventPoints:     s.lastEventPoints,
		Message:             s.messageLocked(),
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

func (s *Session) winnerProfitLocked() float64 {
	if s.phase != PhaseMatchOver || s.draw || s.winnerUserID == 0 {
		return 0
	}

	// В интерфейсе показывается чистая прибыль победителя: 90% его ставки.
	return roundToTwo(s.betCoins * 0.90)
}

func roundToTwo(value float64) float64 {
	if value <= 0 {
		return 0
	}
	return float64(int64(value*100+0.5)) / 100
}

func maxFloat64(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
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
	s.sendToLocked(userID, map[string]any{"type": "error", "error": message})
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
	if s.ballzFinishTimer != nil {
		s.ballzFinishTimer.Stop()
	}
	for _, client := range s.clients {
		_ = client.conn.Close()
	}
	s.clients = make(map[uint]*Client)
}

func matchDurationForGame(gameCode string) time.Duration {
	switch normalizeGameCode(gameCode) {
	case CoinChaseGameCode:
		return CoinChaseMatchDuration
	case CubeFillGameCode:
		return CubeFillMatchDuration
	case DrawDropGameCode:
		return DrawDropMatchDuration
	case BallzDuelGameCode:
		return BallzDuelMatchDuration
	default:
		return MatchDuration
	}
}

func IsSupportedGame(gameCode string) bool {
	switch normalizeGameCode(gameCode) {
	case FlappyRaceGameCode, DoodleJumpGameCode, CrossyPVPGameCode, CoinChaseGameCode, CubeFillGameCode, DrawDropGameCode, BallzDuelGameCode:
		return true
	default:
		return false
	}
}

func normalizeGameCode(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, "-", "_")
	value = strings.ReplaceAll(value, " ", "_")
	return value
}

func comboMultiplier(combo int) int {
	multiplier := 1 + maxInt(0, combo-1)/4
	if multiplier > 5 {
		return 5
	}
	return multiplier
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
