package airhockey

import (
	"errors"
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode    = "air_hockey"
	TargetGoals = 3

	BoardWidth  = 1.0
	BoardHeight = 1.72

	SimulationHz = 60
	SnapshotHz   = 20

	PhaseWaiting   = "waiting"
	PhasePlaying   = "playing"
	PhaseGoal      = "goal"
	PhaseMatchOver = "match_over"

	paddleRadius = 0.07
	puckRadius   = 0.035
	goalMinX     = 0.30
	goalMaxX     = 0.70

	paddleMaxSpeed = 3.4
	puckMaxSpeed   = 1.75
	serveSpeed     = 0.72
	wallBounce     = 0.92
	paddleBounce   = 0.96
	paddleTransfer = 0.72
	frictionPer60  = 0.994

	goalPause = 900 * time.Millisecond
)

type Vec2 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type MovingBody struct {
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	VX float64 `json:"vx"`
	VY float64 `json:"vy"`
}

type PaddlePublic struct {
	MovingBody
	InputSeq uint64 `json:"input_seq"`
}

type ClientMessage struct {
	Type string  `json:"type"`
	X    float64 `json:"x,omitempty"`
	Y    float64 `json:"y,omitempty"`
	Seq  uint64  `json:"seq,omitempty"`
}

type PublicState struct {
	Type             string                `json:"type"`
	Game             string                `json:"game"`
	LobbyID          string                `json:"lobby_id"`
	Phase            string                `json:"phase"`
	Ready            bool                  `json:"ready"`
	ServerMS         int64                 `json:"server_ms"`
	Tick             uint64                `json:"tick"`
	TargetGoals      int                   `json:"target_goals"`
	BoardWidth       float64               `json:"board_width"`
	BoardHeight      float64               `json:"board_height"`
	PlayerOrder      []uint                `json:"player_order"`
	Puck             MovingBody            `json:"puck"`
	Paddles          map[uint]PaddlePublic `json:"paddles"`
	Score            map[uint]int          `json:"score"`
	GoalSeq          uint64                `json:"goal_seq"`
	GoalScorerUserID uint                  `json:"goal_scorer_user_id,omitempty"`
	WinnerUserID     uint                  `json:"winner_user_id,omitempty"`
	Message          string                `json:"message,omitempty"`
}

type paddleState struct {
	MovingBody
	TargetX  float64
	TargetY  float64
	InputSeq uint64
}

type Manager struct {
	mu          sync.Mutex
	sessions    map[string]*Session
	onMatchOver func(lobbyID string, winnerUserID uint)
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*Session)}
}

func (m *Manager) SetOnMatchOver(fn func(lobbyID string, winnerUserID uint)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onMatchOver = fn
}

func (m *Manager) Connect(lobbyID string, playerIDs []uint, userID uint, conn *websocket.Conn) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("air hockey requires exactly 2 players")
	}
	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	m.mu.Lock()
	session, ok := m.sessions[lobbyID]
	if !ok {
		onMatchOver := m.onMatchOver
		session = NewSession(lobbyID, playerIDs, onMatchOver, func() {
			m.mu.Lock()
			delete(m.sessions, lobbyID)
			m.mu.Unlock()
		})
		m.sessions[lobbyID] = session
	}
	m.mu.Unlock()

	return session.Attach(userID, conn)
}

func (m *Manager) RemoveSession(lobbyID string) {
	m.mu.Lock()
	session := m.sessions[lobbyID]
	delete(m.sessions, lobbyID)
	m.mu.Unlock()
	if session != nil {
		session.Close()
	}
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for now := range ticker.C {
		m.mu.Lock()
		stale := make([]*Session, 0)
		for id, session := range m.sessions {
			if session.CanCleanup(now) {
				delete(m.sessions, id)
				stale = append(stale, session)
			}
		}
		m.mu.Unlock()

		for _, session := range stale {
			session.Close()
		}
	}
}

type client struct {
	userID    uint
	conn      *websocket.Conn
	send      chan any
	done      chan struct{}
	closeOnce sync.Once
}

func newClient(userID uint, conn *websocket.Conn) *client {
	return &client{
		userID: userID,
		conn:   conn,
		send:   make(chan any, 4),
		done:   make(chan struct{}),
	}
}

func (c *client) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.conn.Close()
	})
}

func (c *client) Enqueue(v any) {
	select {
	case <-c.done:
		return
	default:
	}

	select {
	case c.send <- v:
		return
	default:
	}

	// Клиент не успевает читать: выбрасываем устаревший snapshot,
	// но не создаём бесконечную очередь и не тормозим игровой tick.
	select {
	case <-c.send:
	default:
	}
	select {
	case c.send <- v:
	default:
	}
}

func (c *client) writeLoop() {
	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()
	defer c.Close()

	for {
		select {
		case payload := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(4 * time.Second))
			if err := c.conn.WriteJSON(payload); err != nil {
				return
			}
		case <-pingTicker.C:
			deadline := time.Now().Add(4 * time.Second)
			_ = c.conn.SetWriteDeadline(deadline)
			if err := c.conn.WriteControl(websocket.PingMessage, []byte("ping"), deadline); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

type Session struct {
	mu sync.Mutex

	lobbyID     string
	playerOrder []uint
	clients     map[uint]*client
	paddles     map[uint]*paddleState
	score       map[uint]int
	puck        MovingBody

	phase            string
	tick             uint64
	goalSeq          uint64
	goalScorerUserID uint
	winnerUserID     uint
	resumeAt         time.Time
	serveDirection   float64
	started          bool
	closed           bool
	lastActivity     time.Time

	onMatchOver func(lobbyID string, winnerUserID uint)
	onDone      func()
	stop        chan struct{}
	stopOnce    sync.Once
}

func NewSession(
	lobbyID string,
	playerIDs []uint,
	onMatchOver func(lobbyID string, winnerUserID uint),
	onDone func(),
) *Session {
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	session := &Session{
		lobbyID:        lobbyID,
		playerOrder:    ids,
		clients:        make(map[uint]*client),
		paddles:        make(map[uint]*paddleState, len(ids)),
		score:          map[uint]int{ids[0]: 0, ids[1]: 0},
		phase:          PhaseWaiting,
		serveDirection: 1,
		lastActivity:   time.Now(),
		onMatchOver:    onMatchOver,
		onDone:         onDone,
		stop:           make(chan struct{}),
	}

	session.paddles[ids[0]] = &paddleState{
		MovingBody: MovingBody{X: BoardWidth / 2, Y: BoardHeight - 0.16},
		TargetX:    BoardWidth / 2,
		TargetY:    BoardHeight - 0.16,
	}
	session.paddles[ids[1]] = &paddleState{
		MovingBody: MovingBody{X: BoardWidth / 2, Y: 0.16},
		TargetX:    BoardWidth / 2,
		TargetY:    0.16,
	}
	session.resetPuckLocked(1)

	go session.run()
	return session
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	cl := newClient(userID, conn)

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return errors.New("match session is closed")
	}
	if old := s.clients[userID]; old != nil {
		old.Close()
	}
	s.clients[userID] = cl
	s.lastActivity = time.Now()

	if len(s.clients) == len(s.playerOrder) && s.winnerUserID == 0 {
		if !s.started || s.phase == PhaseWaiting {
			s.started = true
			s.resetPuckLocked(randomServeDirection())
		}
		s.phase = PhasePlaying
	}
	state := s.publicStateLocked()
	s.mu.Unlock()

	go cl.writeLoop()
	cl.Enqueue(state)

	defer func() {
		s.mu.Lock()
		if s.clients[userID] == cl {
			delete(s.clients, userID)
		}
		if !s.closed && s.winnerUserID == 0 {
			s.phase = PhaseWaiting
			s.puck.VX = 0
			s.puck.VY = 0
		}
		s.lastActivity = time.Now()
		s.mu.Unlock()
		cl.Close()
	}()

	conn.SetReadLimit(4 << 10)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})

	for {
		var msg ClientMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return nil
		}
		s.Handle(userID, msg)
	}
}

func (s *Session) Handle(userID uint, msg ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed || !containsPlayer(s.playerOrder, userID) {
		return
	}
	s.lastActivity = time.Now()

	switch msg.Type {
	case "state":
		if cl := s.clients[userID]; cl != nil {
			cl.Enqueue(s.publicStateLocked())
		}
	case "input":
		s.applyInputLocked(userID, msg)
	case "ping":
		if cl := s.clients[userID]; cl != nil {
			cl.Enqueue(map[string]any{
				"type":      "pong",
				"server_ms": time.Now().UTC().UnixMilli(),
			})
		}
	default:
		if cl := s.clients[userID]; cl != nil {
			cl.Enqueue(map[string]any{"type": "error", "error": "unknown command"})
		}
	}
}

func (s *Session) applyInputLocked(userID uint, msg ClientMessage) {
	if s.phase != PhasePlaying || !isFinite(msg.X) || !isFinite(msg.Y) {
		return
	}

	paddle := s.paddles[userID]
	if paddle == nil || msg.Seq <= paddle.InputSeq {
		return
	}

	msg.X, msg.Y = clampPaddleTarget(s.playerOrder, userID, msg.X, msg.Y)
	paddle.TargetX = msg.X
	paddle.TargetY = msg.Y
	paddle.InputSeq = msg.Seq
}

func (s *Session) run() {
	simulationTicker := time.NewTicker(time.Second / SimulationHz)
	defer simulationTicker.Stop()

	snapshotEvery := SimulationHz / SnapshotHz
	if snapshotEvery < 1 {
		snapshotEvery = 1
	}

	last := time.Now()
	for {
		select {
		case now := <-simulationTicker.C:
			dt := now.Sub(last).Seconds()
			last = now
			if dt <= 0 || dt > 0.05 {
				dt = 1.0 / SimulationHz
			}

			s.mu.Lock()
			if s.closed {
				s.mu.Unlock()
				return
			}
			s.stepLocked(dt, now)
			s.tick++
			if s.tick%uint64(snapshotEvery) == 0 {
				s.broadcastLocked(s.publicStateLocked())
			}
			s.mu.Unlock()
		case <-s.stop:
			return
		}
	}
}

func (s *Session) stepLocked(dt float64, now time.Time) {
	if s.phase == PhaseGoal {
		if !s.resumeAt.IsZero() && !now.Before(s.resumeAt) && len(s.clients) == len(s.playerOrder) {
			s.phase = PhasePlaying
			s.goalScorerUserID = 0
			s.resetPuckLocked(s.serveDirection)
		}
		return
	}
	if s.phase != PhasePlaying || len(s.clients) != len(s.playerOrder) {
		return
	}

	for _, userID := range s.playerOrder {
		s.movePaddleLocked(userID, dt)
	}

	s.puck.X += s.puck.VX * dt
	s.puck.Y += s.puck.VY * dt

	friction := math.Pow(frictionPer60, dt*SimulationHz)
	s.puck.VX *= friction
	s.puck.VY *= friction

	if s.puck.X < puckRadius {
		s.puck.X = puckRadius
		s.puck.VX = math.Abs(s.puck.VX) * wallBounce
	} else if s.puck.X > BoardWidth-puckRadius {
		s.puck.X = BoardWidth - puckRadius
		s.puck.VX = -math.Abs(s.puck.VX) * wallBounce
	}

	insideGoal := s.puck.X > goalMinX && s.puck.X < goalMaxX
	if s.puck.Y < puckRadius && !insideGoal {
		s.puck.Y = puckRadius
		s.puck.VY = math.Abs(s.puck.VY) * wallBounce
	} else if s.puck.Y > BoardHeight-puckRadius && !insideGoal {
		s.puck.Y = BoardHeight - puckRadius
		s.puck.VY = -math.Abs(s.puck.VY) * wallBounce
	}

	for _, userID := range s.playerOrder {
		s.resolvePaddleCollisionLocked(s.paddles[userID])
	}
	clampBodySpeed(&s.puck, puckMaxSpeed)

	if insideGoal && s.puck.Y < -puckRadius {
		// Верхние ворота: забил нижний игрок playerOrder[0].
		s.goalLocked(s.playerOrder[0], -1)
	} else if insideGoal && s.puck.Y > BoardHeight+puckRadius {
		// Нижние ворота: забил верхний игрок playerOrder[1].
		s.goalLocked(s.playerOrder[1], 1)
	}
}

func (s *Session) movePaddleLocked(userID uint, dt float64) {
	paddle := s.paddles[userID]
	if paddle == nil {
		return
	}

	dx := paddle.TargetX - paddle.X
	dy := paddle.TargetY - paddle.Y
	distance := math.Hypot(dx, dy)
	maxMove := paddleMaxSpeed * dt

	oldX, oldY := paddle.X, paddle.Y
	if distance <= maxMove || distance == 0 {
		paddle.X = paddle.TargetX
		paddle.Y = paddle.TargetY
	} else {
		paddle.X += dx / distance * maxMove
		paddle.Y += dy / distance * maxMove
	}

	paddle.X, paddle.Y = clampPaddleTarget(s.playerOrder, userID, paddle.X, paddle.Y)
	paddle.VX = (paddle.X - oldX) / dt
	paddle.VY = (paddle.Y - oldY) / dt
}

func (s *Session) resolvePaddleCollisionLocked(paddle *paddleState) {
	if paddle == nil {
		return
	}

	dx := s.puck.X - paddle.X
	dy := s.puck.Y - paddle.Y
	distance := math.Hypot(dx, dy)
	minDistance := puckRadius + paddleRadius
	if distance >= minDistance {
		return
	}
	if distance < 0.000001 {
		dx, dy, distance = 0, -1, 1
	}

	nx := dx / distance
	ny := dy / distance
	s.puck.X = paddle.X + nx*minDistance
	s.puck.Y = paddle.Y + ny*minDistance

	relVX := s.puck.VX - paddle.VX
	relVY := s.puck.VY - paddle.VY
	approach := relVX*nx + relVY*ny
	if approach >= 0 {
		return
	}

	reflectedVX := relVX - (1+paddleBounce)*approach*nx
	reflectedVY := relVY - (1+paddleBounce)*approach*ny

	s.puck.VX = reflectedVX + paddle.VX*paddleTransfer
	s.puck.VY = reflectedVY + paddle.VY*paddleTransfer

	if math.Hypot(s.puck.VX, s.puck.VY) < 0.38 {
		s.puck.VX += nx * 0.38
		s.puck.VY += ny * 0.38
	}
}

func (s *Session) goalLocked(scorerUserID uint, serveDirection float64) {
	if s.phase != PhasePlaying || s.winnerUserID != 0 {
		return
	}

	s.score[scorerUserID]++
	s.goalSeq++
	s.goalScorerUserID = scorerUserID
	s.serveDirection = serveDirection
	s.puck = MovingBody{X: BoardWidth / 2, Y: BoardHeight / 2}

	if s.score[scorerUserID] >= TargetGoals {
		s.phase = PhaseMatchOver
		s.winnerUserID = scorerUserID
		s.broadcastLocked(s.publicStateLocked())

		if s.onMatchOver != nil {
			lobbyID := s.lobbyID
			winnerID := scorerUserID
			callback := s.onMatchOver
			go callback(lobbyID, winnerID)
		}

		go func() {
			timer := time.NewTimer(8 * time.Second)
			defer timer.Stop()
			select {
			case <-timer.C:
				s.Close()
			case <-s.stop:
			}
		}()
		return
	}

	s.phase = PhaseGoal
	s.resumeAt = time.Now().Add(goalPause)
	s.broadcastLocked(s.publicStateLocked())
}

func (s *Session) resetPuckLocked(direction float64) {
	if direction == 0 {
		direction = randomServeDirection()
	}
	angleX := (rand.Float64() - 0.5) * 0.38
	s.puck = MovingBody{
		X:  BoardWidth / 2,
		Y:  BoardHeight / 2,
		VX: angleX,
		VY: serveSpeed * direction,
	}
	clampBodySpeed(&s.puck, puckMaxSpeed)
}

func (s *Session) publicStateLocked() PublicState {
	paddles := make(map[uint]PaddlePublic, len(s.paddles))
	for userID, paddle := range s.paddles {
		paddles[userID] = PaddlePublic{
			MovingBody: paddle.MovingBody,
			InputSeq:   paddle.InputSeq,
		}
	}

	score := make(map[uint]int, len(s.score))
	for userID, value := range s.score {
		score[userID] = value
	}

	return PublicState{
		Type:             "state",
		Game:             GameCode,
		LobbyID:          s.lobbyID,
		Phase:            s.phase,
		Ready:            len(s.clients) == len(s.playerOrder),
		ServerMS:         time.Now().UTC().UnixMilli(),
		Tick:             s.tick,
		TargetGoals:      TargetGoals,
		BoardWidth:       BoardWidth,
		BoardHeight:      BoardHeight,
		PlayerOrder:      append([]uint(nil), s.playerOrder...),
		Puck:             s.puck,
		Paddles:          paddles,
		Score:            score,
		GoalSeq:          s.goalSeq,
		GoalScorerUserID: s.goalScorerUserID,
		WinnerUserID:     s.winnerUserID,
		Message:          s.messageLocked(),
	}
}

func (s *Session) messageLocked() string {
	switch s.phase {
	case PhaseWaiting:
		return "Ожидаем второго игрока"
	case PhaseGoal:
		return "Гол"
	case PhaseMatchOver:
		return "Матч завершён"
	default:
		return "Игра идёт"
	}
}

func (s *Session) broadcastLocked(state PublicState) {
	for _, cl := range s.clients {
		cl.Enqueue(state)
	}
}

func (s *Session) CanCleanup(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return true
	}
	if len(s.clients) > 0 {
		return false
	}
	return now.Sub(s.lastActivity) > 10*time.Minute
}

func (s *Session) Close() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		clients := make([]*client, 0, len(s.clients))
		for _, cl := range s.clients {
			clients = append(clients, cl)
		}
		s.clients = make(map[uint]*client)
		s.mu.Unlock()

		close(s.stop)
		for _, cl := range clients {
			cl.Close()
		}
		if s.onDone != nil {
			s.onDone()
		}
	})
}

func clampPaddleTarget(playerOrder []uint, userID uint, x, y float64) (float64, float64) {
	x = clamp(x, paddleRadius, BoardWidth-paddleRadius)
	if len(playerOrder) < 2 {
		return x, clamp(y, paddleRadius, BoardHeight-paddleRadius)
	}

	if userID == playerOrder[0] {
		y = clamp(y, BoardHeight/2+paddleRadius, BoardHeight-paddleRadius)
	} else {
		y = clamp(y, paddleRadius, BoardHeight/2-paddleRadius)
	}
	return x, y
}

func containsPlayer(players []uint, userID uint) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}
	return false
}

func clamp(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func clampBodySpeed(body *MovingBody, maxSpeed float64) {
	speed := math.Hypot(body.VX, body.VY)
	if speed <= maxSpeed || speed == 0 {
		return
	}
	body.VX = body.VX / speed * maxSpeed
	body.VY = body.VY / speed * maxSpeed
}

func randomServeDirection() float64 {
	if rand.Intn(2) == 0 {
		return -1
	}
	return 1
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
